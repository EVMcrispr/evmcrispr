import "../setup";
import { describe, expect, it } from "bun:test";
import {
  type Action,
  BindingsSpace,
  type TransactionAction,
} from "@evmcrispr/sdk";
import { getTransports, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { concatHex, encodeAbiParameters, getContractAddress } from "viem";
import {
  frameAccountBytecode,
  frameSponsorBytecode,
} from "../../src/contracts/artifacts";

const DEPLOYED = "0x00000000000000000000000000000000000d3b10";
const OTHER = "0x0000000000000000000000000000000000000002";
const addr = (a: string) =>
  encodeAbiParameters([{ type: "address" }], [a as `0x${string}`]).slice(2);

const run = async (
  script: string,
  receipt: unknown = { status: "success", contractAddress: DEPLOYED },
  chainId = 1337,
  withCallback = true,
) => {
  const evm = new Interpreter(evml.registry, {
    account: TEST_ACCOUNT_ADDRESS,
    chainId,
    transports: getTransports(),
  });
  const sent: TransactionAction[] = [];
  const cb = async (action: Action) => {
    sent.push(action as TransactionAction);
    return receipt;
  };
  const actions = await (withCallback
    ? evm.interpret(script, cb)
    : evm.interpret(script));
  return { sent, evm, actions };
};

describe("frame > new-account / new-sponsor", () => {
  it("new-account deploys a FrameAccount owned by @me and binds the receipt's address", async () => {
    const { sent, evm } = await run(
      "load frame [new-account]\nnew-account $account",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.data).toBe(
      concatHex([frameAccountBytecode, `0x${addr(TEST_ACCOUNT_ADDRESS)}`]),
    );
    expect(sent[0]!.gas).toBe(6_000_000n);
    expect(evm.getBinding("$account", BindingsSpace.USER)).toBe(DEPLOYED);
  });

  it("new-sponsor deploys a FrameSponsor for the account, funded with --fund", async () => {
    const { sent } = await run(
      `load frame [new-sponsor]\nnew-sponsor $sponsor --for ${OTHER} --fund 5000`,
    );
    expect(sent[0]!.value).toBe(5000n);
    expect(sent[0]!.data).toBe(
      concatHex([
        frameSponsorBytecode,
        `0x${addr(TEST_ACCOUNT_ADDRESS)}${addr(OTHER)}`,
      ]),
    );
  });

  it("binds the receipt's address, not a predicted one", async () => {
    const predicted = getContractAddress({
      from: TEST_ACCOUNT_ADDRESS,
      nonce: 0n,
    });
    expect(predicted.toLowerCase()).not.toBe(DEPLOYED);
    const { evm } = await run("load frame [new-account]\nnew-account $a");
    expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(DEPLOYED);
  });

  it("refuses a reverted deployment", async () => {
    await expect(
      run("load frame [new-account]\nnew-account $a", {
        status: "reverted",
        contractAddress: DEPLOYED,
      }),
    ).rejects.toThrow(/did not succeed/);
  });

  it("needs an execution context with a wallet", async () => {
    await expect(
      run("load frame [new-account]\nnew-account $a", undefined, 1337, false),
    ).rejects.toThrow(/needs .*wallet/);
  });

  it("refuses a chain other than 1337", async () => {
    await expect(
      run("load frame [new-account]\nnew-account $a", undefined, 100),
    ).rejects.toThrow(/1337/);
  });
});
