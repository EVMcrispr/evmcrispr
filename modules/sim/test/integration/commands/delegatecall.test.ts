import "../../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

import { getForkBlockNumber } from "../../../../../scripts/anvil-config";
import {
  DELEGATECALL_EVENT,
  DELEGATECALL_SHADOW,
} from "../../../src/lib/delegatecall";

const FORK_BLOCK_NUMBER = await getForkBlockNumber();

const ACCOUNT = "0x00000000000000000000000000000000000dc001";
const LIBRARY = "0x00000000000000000000000000000000000dc002";
const EOA = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";

// The account answers 7 to any call.
const ACCOUNT_CODE = "0x600760005260206000f3";
// The library stores 42 at slot 1, then asks `this` (the account, mid-
// delegatecall) for its answer and stores it at slot 2.
const LIBRARY_CODE = "0x602a6001556020600060006000305afa50600051600255" + "00";
// The library reverts with the word 0x1234.
const REVERTING_CODE = "0x61123460005260206000fd";

const BACKENDS = [
  { name: "anvil", forkOpts: "--using anvil" },
  {
    name: "ethereumjs",
    forkOpts: `--using ethereumjs --block-number ${FORK_BLOCK_NUMBER}`,
  },
  {
    name: "revm",
    forkOpts: `--using revm --block-number ${FORK_BLOCK_NUMBER}`,
  },
  {
    // The node itself, through eth_simulateV1.
    name: "rpc",
    forkOpts: `--using rpc --block-number ${FORK_BLOCK_NUMBER}`,
  },
] as const;

const word = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const storedAt = (address: string, n: number, value: number) =>
  `sim:expect @bool(@str(@contracts:storageAt(${address} ${n})) == @str("${word(value)}"))`;

for (const backend of BACKENDS) {
  describe(`Sim > delegatecall from an account – ${backend.name}`, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    function run(as: string, body: string, library = LIBRARY_CODE) {
      const script = [
        "load sim",
        "load safe",
        "load contracts",
        `sim:fork ${backend.forkOpts} --as ${as} (`,
        `  sim:set-balance ${as} 10e18`,
        `  sim:set-code ${ACCOUNT} ${ACCOUNT_CODE}`,
        `  sim:set-code ${LIBRARY} ${library}`,
        body,
        ")",
      ].join("\n");
      return createInterpreter(script, client).interpret();
    }

    it("runs the library on the account's storage, and calls back into its own code", async () => {
      await run(
        ACCOUNT,
        [
          `  safe:delegate-exec ${LIBRARY} "run()"`,
          `  ${storedAt(ACCOUNT, 1, 42)}`,
          `  ${storedAt(ACCOUNT, 2, 7)}`,
          `  ${storedAt(LIBRARY, 1, 0)}`,
        ].join("\n"),
      );
    });

    it("puts the account's code back and leaves nothing parked", async () => {
      await run(
        ACCOUNT,
        [
          `  safe:delegate-exec ${LIBRARY} "run()"`,
          `  sim:expect @bool(@str(@contracts:codeAt(${ACCOUNT})) == @str("${ACCOUNT_CODE}"))`,
          `  sim:expect @bool(@str(@contracts:codeAt(${DELEGATECALL_SHADOW})) == @str("0x"))`,
        ].join("\n"),
      );
    });

    it("fails with the library's revert, and still puts the code back", async () => {
      await expect(
        run(ACCOUNT, `  safe:delegate-exec ${LIBRARY} "run()"`, REVERTING_CODE),
      ).rejects.toThrow();
    });

    it("refuses a delegatecall from an account without code", async () => {
      await expect(
        run(EOA, `  safe:delegate-exec ${LIBRARY} "run()"`),
      ).rejects.toThrow(/only a contract account/);
    });

    it("refuses a delegatecall inside a wallet batch", async () => {
      await expect(
        run(
          EOA,
          [
            "  batch (",
            `    safe:delegate-exec ${LIBRARY} "run()"`,
            "  )",
          ].join("\n"),
        ),
      ).rejects.toThrow(/cannot delegatecall/);
    });
  });
}

describe("Sim > delegatecall suggestion event", () => {
  it("is a declaration the suggestion pipeline can parse", () => {
    expect(DELEGATECALL_EVENT).toMatch(/^event \w+\(address indexed target\)$/);
  });
});

describe("Sim > delegate-exec outside a simulation", () => {
  it("still needs a Safe block", async () => {
    const client = getPublicClient();
    await expect(
      createInterpreter(
        `load safe\nsafe:delegate-exec ${LIBRARY} "run()"`,
        client,
      ).interpret(),
    ).rejects.toThrow(/safe:propose or safe:execute block/);
  });
});
