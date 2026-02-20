import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { EVMcrispr } from "@evmcrispr/core";
import {
  type Action,
  BindingsSpace,
  encodeAction,
  isBatchedAction,
  isTransactionAction,
  toDecimals,
} from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  getPublicClient,
  getWalletClients,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import type { PublicClient, WalletClient } from "viem";
import { toHex } from "viem";
import { gnosis } from "viem/chains";

const target = "0x44fA8E6f47987339850636F88629646662444217"; // DAI
const params = ["0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6", "1200e18"];
const resolvedParams = [
  "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6",
  toDecimals(1200, 18),
];
const fnSig = "approve(address,uint256)";

describeCommand("exec", {
  describeName:
    "Std > commands > exec <target> <fnSignature> [<...params>] [--from <sender>]",
  cases: [
    {
      name: "should return a correct exec action",
      script: `exec ${target} ${fnSig} ${params.join(" ")}`,
      expectedActions: [encodeAction(target, fnSig, resolvedParams)],
    },
    {
      name: "should return a correct exec action with value",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --value 1e18`,
      expectedActions: [
        encodeAction(target, fnSig, resolvedParams, {
          value: 1000000000000000000n,
        }),
      ],
    },
    {
      name: "should return a correct exec action with from address",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --from ${target}`,
      expectedActions: [
        encodeAction(target, fnSig, resolvedParams, { from: target }),
      ],
    },
    {
      name: "should return a correct exec action with value and from address",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --value 1e18 --from ${target}`,
      expectedActions: [
        encodeAction(target, fnSig, resolvedParams, {
          value: 1000000000000000000n,
          from: target,
        }),
      ],
    },
    {
      name: "should handle implicit bytes conversion for string parameters",
      script: `exec 0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7 addBatches(bytes32[],bytes) [0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667] QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2`,
      expectedActions: [
        encodeAction(
          "0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7",
          "addBatches(bytes32[],bytes)",
          [
            [
              "0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667",
            ],
            toHex("QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2"),
          ],
        ),
      ],
    },
    {
      name: "should return exec action when receiving just the method's name",
      script: `exec ${target} transfer @me 1500e18`,
      expectedActions: [
        encodeAction(
          "0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9",
          "transfer(address,uint256)",
          [TEST_ACCOUNT_ADDRESS, toDecimals(1500)],
        ),
      ],
    },
    {
      name: "should return exec action with --gas option",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --gas 100000`,
      expectedActions: [
        { ...encodeAction(target, fnSig, resolvedParams), gas: 100000n },
      ],
    },
    {
      name: "should return exec action with --nonce option",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --nonce 5`,
      expectedActions: [
        { ...encodeAction(target, fnSig, resolvedParams), nonce: 5 },
      ],
    },
    {
      name: "should return exec action with --max-fee-per-gas option",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --max-fee-per-gas 20e9`,
      expectedActions: [
        {
          ...encodeAction(target, fnSig, resolvedParams),
          maxFeePerGas: 20000000000n,
        },
      ],
    },
    {
      name: "should return exec action with --max-priority-fee-per-gas option",
      script: `exec ${target} ${fnSig} ${params.join(" ")} --max-priority-fee-per-gas 2e9`,
      expectedActions: [
        {
          ...encodeAction(target, fnSig, resolvedParams),
          maxPriorityFeePerGas: 2000000000n,
        },
      ],
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an invalid target address",
      script: `exec false ${fnSig} 1e18`,
      error: `<contractAddress> must be a valid address, got false`,
    },
    {
      name: "should fail when providing an invalid signature",
      script: `exec ${target} invalid(uint256,) 1e18`,
      error: `invalid signature "invalid(uint256,)"`,
    },
    {
      name: "should fail when providing invalid call params",
      script: `exec ${target} ${fnSig} false 1e18`,
      error: "error when encoding approve call",
    },
    {
      name: "should fail when providing invalid value parameter",
      script: `exec ${target} ${fnSig} @me 1e18 --value tata`,
      error: "--value must be a number, got tata",
    },
    {
      name: "should fail when providing invalid from address",
      script: `exec ${target} ${fnSig} @me 1e18 --from tata`,
      error: "--from must be a valid address, got tata",
    },
    {
      name: "should fail when receiving a non-defined target identifier",
      script: `exec non-defined-address "${fnSig}" 1e18`,
      error: "non-defined-address",
    },
  ],
});

describe("Std > commands > exec > event capture", () => {
  let client: PublicClient;
  let walletClient: WalletClient;

  beforeAll(() => {
    client = getPublicClient();
    walletClient = getWalletClients()[0];
  });

  it("should capture event value and use it in a subsequent transaction", async () => {
    const script = `
      set $wxdai 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d
      exec $wxdai deposit() --value 0.001e18 -> Deposit(address indexed,uint):1 $amount
      exec $wxdai withdraw(uint) $amount
    `;

    const account = walletClient.account!;
    const evm = new EVMcrispr(client, account.address);

    const actionCallback = async (action: Action) => {
      if (isTransactionAction(action)) {
        const hash = await walletClient.sendTransaction({
          account: walletClient.account!,
          chain: gnosis,
          to: action.to,
          data: action.data,
          value: action.value,
        });
        return await client.waitForTransactionReceipt({ hash });
      }
      throw new Error("Unexpected action type");
    };

    await evm.interpret(script, actionCallback);

    const amount = evm.getBinding("$amount", BindingsSpace.USER);
    expect(amount).to.equal("1000000000000000");
  });

  it("should capture event value from a batch command", async () => {
    const script = `
set $wxdai 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d
batch (
  exec $wxdai deposit() --value 0.001e18
  exec $wxdai withdraw(uint) 0.001e18
) -> Deposit(address indexed,uint):1 $amount
    `;

    const account = walletClient.account!;
    const evm = new EVMcrispr(client, account.address);

    const actionCallback = async (action: Action) => {
      if (isTransactionAction(action)) {
        const hash = await walletClient.sendTransaction({
          account: walletClient.account!,
          chain: gnosis,
          to: action.to,
          data: action.data,
          value: action.value,
        });
        return await client.waitForTransactionReceipt({ hash });
      }
      if (isBatchedAction(action)) {
        const allLogs: any[] = [];
        for (const txAction of action.actions) {
          const hash = await walletClient.sendTransaction({
            account: walletClient.account!,
            chain: gnosis,
            to: txAction.to,
            data: txAction.data,
            value: txAction.value,
          });
          const receipt = await client.waitForTransactionReceipt({ hash });
          allLogs.push(...receipt.logs);
        }
        return { logs: allLogs };
      }
      throw new Error("Unexpected action type");
    };

    await evm.interpret(script, actionCallback);

    const amount = evm.getBinding("$amount", BindingsSpace.USER);
    expect(amount).to.equal("1000000000000000");
  });
});
