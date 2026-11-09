import "../setup";
import { afterEach, describe, expect, it } from "bun:test";
import {
  type Action,
  BindingsSpace,
  type TransactionAction,
} from "@evmcrispr/sdk";
import { getTransports, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import {
  type Address,
  concatHex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  type Hex,
} from "viem";
import {
  DETERMINISTIC_DEPLOYER,
  deploymentTransactions,
  FACTORY_ADDRESS,
  IMPLEMENTATION_ADDRESS,
  predictAccountAddress,
} from "../../src/addresses";
import {
  frameAccountFactoryAbi,
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
  it("new-sponsor deploys a FrameSponsor for the account, funded with --fund", async () => {
    const { sent } = await run(
      `load frames [new-sponsor]\nnew-sponsor $sponsor --for ${OTHER} --fund 5000`,
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
    const { evm } = await run(
      `load frames [new-sponsor]\nnew-sponsor $a --for ${OTHER}`,
    );
    expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(DEPLOYED);
  });

  it("refuses a reverted deployment", async () => {
    await expect(
      run(`load frames [new-sponsor]\nnew-sponsor $a --for ${OTHER}`, {
        status: "reverted",
        contractAddress: DEPLOYED,
      }),
    ).rejects.toThrow(/did not succeed/);
  });

  it("needs an execution context with a wallet", async () => {
    await expect(
      run(
        `load frames [new-sponsor]\nnew-sponsor $a --for ${OTHER}`,
        undefined,
        1337,
        false,
      ),
    ).rejects.toThrow(/needs .*wallet/);
  });

  it("refuses a chain that is not a frame chain, naming it and the frame chains", async () => {
    await expect(
      run(
        `load frames [new-sponsor]\nnew-sponsor $a --for ${OTHER}`,
        undefined,
        100,
      ),
    ).rejects.toThrow(
      /the alt-mempool devnet, the Frames quick devnet and the Frames mining devnet, not Gnosis/,
    );
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
    const script = `load frames [new-sponsor]\nnew-sponsor $a --for ${OTHER}`;

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

    it("strips the bidi marks U+061C, U+200E and U+200F too", async () => {
      await expect(
        run(script, {
          status: "queued\u200e",
          reason: "wa\u061cit\u200f for it",
        }),
      ).rejects.toThrow("(status queued): wait for it");
    });
  });

  it("new-sponsor without --for is refused", async () => {
    await expect(
      run("load frames [new-sponsor]\nnew-sponsor $s"),
    ).rejects.toThrow(/needs --for/);
  });
});

describe("frame > new-account through the factory", () => {
  const proto = Frame.prototype as unknown as { getClient: unknown };
  const original = proto.getClient;
  afterEach(() => {
    proto.getClient = original;
  });
  /** A chain where `deployed` (and, unless told otherwise, the deterministic deployer) have code. */
  const chainWith = (deployed: Address[], deployer = true) => {
    const code = new Set(
      [...deployed, ...(deployer ? [DETERMINISTIC_DEPLOYER] : [])].map((a) =>
        a.toLowerCase(),
      ),
    );
    proto.getClient = async () => ({
      getCode: async ({ address }: { address: Address }) =>
        code.has(address.toLowerCase()) ? ("0x60" as Hex) : undefined,
    });
    return code;
  };
  /** Records what is sent; a createAccount gives the account its code. */
  const runIn = async (script: string, code: Set<string>, chainId = 1337) => {
    const evm = new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      chainId,
      transports: getTransports(),
    });
    const sent: TransactionAction[] = [];
    await evm.interpret(script, async (action: Action) => {
      const tx = action as TransactionAction;
      sent.push(tx);
      if (tx.to?.toLowerCase() === FACTORY_ADDRESS.toLowerCase()) {
        const { args } = decodeFunctionData({
          abi: frameAccountFactoryAbi,
          data: tx.data!,
        });
        code.add(
          predictAccountAddress(
            args[0] as Address,
            args[1] as bigint,
          ).toLowerCase(),
        );
      } else if (
        tx.to?.toLowerCase() === DETERMINISTIC_DEPLOYER.toLowerCase()
      ) {
        // The deployer creates what the call's init code builds.
        const [implementation, factory] = deploymentTransactions();
        if (tx.data === implementation!.data)
          code.add(IMPLEMENTATION_ADDRESS.toLowerCase());
        if (tx.data === factory!.data) code.add(FACTORY_ADDRESS.toLowerCase());
      }
      return { status: "success" };
    });
    return { sent, evm };
  };
  const createCall = (owner: Address, salt: bigint) =>
    encodeFunctionData({
      abi: frameAccountFactoryAbi,
      functionName: "createAccount",
      args: [owner, salt],
    });

  it("deploys the implementation and the factory first, then the account", async () => {
    const code = chainWith([]);
    const { sent, evm } = await runIn(
      "load frames [new-account]\nnew-account $account",
      code,
    );
    expect(sent.map((t) => [t.to, t.data])).toEqual([
      ...deploymentTransactions().map((t) => [t.to, t.data]),
      [FACTORY_ADDRESS, createCall(TEST_ACCOUNT_ADDRESS, 0n)],
    ]);
    expect(evm.getBinding("$account", BindingsSpace.USER)).toBe(
      predictAccountAddress(TEST_ACCOUNT_ADDRESS, 0n),
    );
  });

  it("only creates the account when the factory exists, and only binds it when the account does", async () => {
    const code = chainWith([IMPLEMENTATION_ADDRESS, FACTORY_ADDRESS]);
    const first = await runIn(
      "load frames [new-account]\nnew-account $a",
      code,
    );
    expect(first.sent.map((t) => t.to)).toEqual([FACTORY_ADDRESS]);
    const again = await runIn(
      "load frames [new-account]\nnew-account $a",
      code,
    );
    expect(again.sent).toEqual([]);
    expect(again.evm.getBinding("$a", BindingsSpace.USER)).toBe(
      predictAccountAddress(TEST_ACCOUNT_ADDRESS, 0n),
    );
  });

  it("creates the account for --owner and --salt", async () => {
    const code = chainWith([IMPLEMENTATION_ADDRESS, FACTORY_ADDRESS]);
    const { sent, evm } = await runIn(
      `load frames [new-account]\nnew-account $a --owner ${OTHER} --salt 7`,
      code,
    );
    expect(sent[0]!.data).toBe(createCall(OTHER, 7n));
    expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(
      predictAccountAddress(OTHER, 7n),
    );
  });

  it("refuses a salt that is not a non-negative integer below 2^256", async () => {
    const code = chainWith([IMPLEMENTATION_ADDRESS, FACTORY_ADDRESS]);
    for (const salt of ["-1", "1.5"])
      await expect(
        runIn(`load frames [new-account]\nnew-account $a --salt ${salt}`, code),
      ).rejects.toThrow(/--salt must be a non-negative integer below 2\^256/);
  });

  it("works on the mining devnet, leaving gas to the wallet", async () => {
    const code = chainWith([]);
    const { sent } = await runIn(
      "load frames [new-account]\nnew-account $a",
      code,
      81412,
    );
    expect(sent).toHaveLength(3);
    expect(sent.map((t) => t.gas)).toEqual([undefined, undefined, undefined]);
  });

  it("resumes a chain where only the implementation was deployed", async () => {
    const code = chainWith([IMPLEMENTATION_ADDRESS]);
    const { sent } = await runIn(
      "load frames [new-account]\nnew-account $a",
      code,
    );
    expect(sent.map((t) => [t.to, t.data])).toEqual([
      [deploymentTransactions()[1]!.to, deploymentTransactions()[1]!.data],
      [FACTORY_ADDRESS, createCall(TEST_ACCOUNT_ADDRESS, 0n)],
    ]);
  });

  it("refuses a chain without the deterministic deployer", async () => {
    await expect(
      runIn("load frames [new-account]\nnew-account $a", chainWith([], false)),
    ).rejects.toThrow(/no deterministic deployer/);
  });

  it("refuses the quick devnet, which never mines, for both commands", async () => {
    for (const script of [
      "load frames [new-account]\nnew-account $a",
      `load frames [new-sponsor]\nnew-sponsor $s --for ${OTHER}`,
    ])
      await expect(
        runIn(
          script,
          chainWith([IMPLEMENTATION_ADDRESS, FACTORY_ADDRESS]),
          81411,
        ),
      ).rejects.toThrow(/Frames quick devnet never mines.*switch framesMining/);
  });

  it("@frames:account predicts the address without sending anything", async () => {
    const code = chainWith([]);
    const { sent, evm } = await runIn(
      `load frames\nset $a @frames:account(@me)\nset $b @frames:account(${OTHER} 3)`,
      code,
    );
    expect(sent).toEqual([]);
    expect(evm.getBinding("$a", BindingsSpace.USER)).toBe(
      predictAccountAddress(TEST_ACCOUNT_ADDRESS, 0n),
    );
    expect(evm.getBinding("$b", BindingsSpace.USER)).toBe(
      predictAccountAddress(OTHER, 3n),
    );
  });
});
