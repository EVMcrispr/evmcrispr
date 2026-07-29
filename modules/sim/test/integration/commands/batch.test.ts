import "../../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";

import { FORK_BLOCK_NUMBER } from "../../../../../scripts/anvil-config";
import {
  DELEGATOR_ADDRESS,
  delegationDesignator,
} from "../../../src/lib/delegate";

const SENDER = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const DESIGNATOR = delegationDesignator(DELEGATOR_ADDRESS).toLowerCase();

const BACKENDS = [
  { name: "anvil", forkOpts: "--using anvil" },
  {
    name: "ethereumjs",
    // Pin to the anvil fork block — the in-process backends fork from the
    // local anvil over RPC, which only serves the block it was launched at.
    forkOpts: `--using ethereumjs --block-number ${FORK_BLOCK_NUMBER}`,
  },
  {
    name: "revm",
    forkOpts: `--using revm --block-number ${FORK_BLOCK_NUMBER}`,
  },
] as const;

for (const backend of BACKENDS) {
  describe(`Sim > batch inside fork (EIP-7702) – ${backend.name}`, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    function run(body: string) {
      // Fund the sender first — anvil still charges impersonated accounts
      // for gas, unlike the ethereumjs backend (skipBalance).
      const script = `load sim\nload contracts\nsim:fork ${backend.forkOpts} --from ${SENDER} (\n  sim:set-balance ${SENDER} 10e18\n${body}\n)`;
      return createInterpreter(script, client).interpret();
    }

    it("executes a batch of two calls atomically via a 7702 delegation", async () => {
      await run(
        [
          "  batch (",
          `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
          `    exec ${WXDAI} "approve(address,uint256)" ${SENDER} 2e18`,
          "  )",
          `  set $a1 @get(${WXDAI} "allowance(address,address)(uint256)" ${SENDER} ${DEAD})`,
          `  set $a2 @get(${WXDAI} "allowance(address,address)(uint256)" ${SENDER} ${SENDER})`,
          "  sim:expect @bool($a1 == 1e18)",
          "  sim:expect @bool($a2 == 2e18)",
        ].join("\n"),
      );
    });

    it("installs the delegation designator on the sender EOA", async () => {
      await run(
        [
          "  batch (",
          `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
          "  )",
          `  set $code @contracts:codeAt(${SENDER})`,
          `  sim:expect @bool(@str($code) == @str("${DESIGNATOR}"))`,
        ].join("\n"),
      );
    });

    it("reuses an existing delegation for consecutive batches", async () => {
      await run(
        [
          "  batch (",
          `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
          "  )",
          "  batch (",
          `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 3e18`,
          `    exec ${WXDAI} "approve(address,uint256)" ${SENDER} 4e18`,
          "  )",
          `  set $a1 @get(${WXDAI} "allowance(address,address)(uint256)" ${SENDER} ${DEAD})`,
          `  set $a2 @get(${WXDAI} "allowance(address,address)(uint256)" ${SENDER} ${SENDER})`,
          "  sim:expect @bool($a1 == 3e18)",
          "  sim:expect @bool($a2 == 4e18)",
        ].join("\n"),
      );
    });

    it("forwards call values from the EOA balance", async () => {
      await run(
        [
          `  sim:set-balance ${SENDER} 50e18`,
          "  batch (",
          `    exec ${WXDAI} "deposit()" --value 1e18`,
          "  )",
          `  set $b @get(${WXDAI} "balanceOf(address)(uint256)" ${SENDER})`,
          "  sim:expect @bool($b == 1e18)",
        ].join("\n"),
      );
    });

    it("reverts the whole batch when one call reverts", async () => {
      await expect(
        run(
          [
            "  batch (",
            `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
            `    exec ${WXDAI} "transfer(address,uint256)" ${DEAD} 999e18`,
            "  )",
          ].join("\n"),
        ),
      ).rejects.toThrow();
    });

    it("fails when the sender has non-delegation contract code", async () => {
      await expect(
        run(
          [
            `  sim:set-code ${SENDER} 0x600160005260206000f3`,
            "  batch (",
            `    exec ${WXDAI} "approve(address,uint256)" ${DEAD} 1e18`,
            "  )",
          ].join("\n"),
        ),
      ).rejects.toThrow("not an EIP-7702 delegation");
    });
  });
}
