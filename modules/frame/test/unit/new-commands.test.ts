import "../setup";
import { afterEach, describe, expect, it } from "bun:test";
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
import Frame from "../../src/index";

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

  describe("receipt shapes", () => {
    const HASH = `0x${"ab".repeat(32)}`;
    const proto = Frame.prototype as unknown as { getClient: unknown };
    const original = proto.getClient;
    afterEach(() => {
      proto.getClient = original;
    });
    const stubClient = (receipt: unknown) => {
      const asked: unknown[] = [];
      proto.getClient = async () => ({
        waitForTransactionReceipt: async (a: unknown) => {
          asked.push(a);
          return receipt;
        },
      });
      return asked;
    };
    const ok = { status: "success", contractAddress: DEPLOYED };
    const script = "load frame [new-account]\nnew-account $a";

    it("waits for the receipt of a returned hash", async () => {
      const asked = stubClient(ok);
      const { evm } = await run(script, HASH);
      expect(asked).toEqual([{ hash: HASH }]);
      expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(DEPLOYED);
    });

    it("waits for the receipt of an object holding only a hash", async () => {
      const asked = stubClient(ok);
      const { evm } = await run(script, { transactionHash: HASH });
      expect(asked).toEqual([{ hash: HASH }]);
      expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(DEPLOYED);
    });

    it("refuses a string that is not a hash", async () => {
      await expect(run(script, "queued")).rejects.toThrow(
        /not a transaction hash/,
      );
    });

    it("names the status and escaped reason of a non-success result", async () => {
      await expect(
        run(script, {
          status: "queued",
          reason: "wait\u001b[31m\u202e for it",
        }),
      ).rejects.toThrow("(status queued): wait[31m for it");
    });
  });

  it("new-sponsor without --for is refused", async () => {
    await expect(
      run("load frame [new-sponsor]\nnew-sponsor $s"),
    ).rejects.toThrow(/needs --for/);
  });
});
