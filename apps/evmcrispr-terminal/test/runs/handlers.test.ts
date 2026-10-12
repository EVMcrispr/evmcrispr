import { describe, expect, mock, test } from "bun:test";
import type { ActionHandlerCtx, BatchedAction } from "@evmcrispr/core";
import type { Action } from "@evmcrispr/sdk";
import { makeSafeBatchedHandler, reachesWallet } from "../../src/runs/handlers";

// The burn address: checksummed, never called.
const to = "0x000000000000000000000000000000000000dEaD" as const;

test("which actions reach the wallet", () => {
  const cases: [Action, boolean][] = [
    [{ to, data: "0x" }, true],
    [{ to, data: "0x", readOnly: true }, false],
    [{ type: "batched", chainId: 1, from: to, actions: [] }, true],
    [
      { type: "wallet", method: "wallet_switchEthereumChain", params: [] },
      true,
    ],
    [{ type: "rpc", method: "evm_mine", params: [] }, false],
    [{ type: "terminal", command: "x", args: {} }, false],
  ];
  for (const [action, expected] of cases)
    expect(reachesWallet(action)).toBe(expected);
});

const batch: BatchedAction = {
  type: "batched",
  chainId: 100,
  from: "0x0000000000000000000000000000000000000001",
  actions: [
    {
      to: "0x0000000000000000000000000000000000000002",
      data: "0x1234",
      value: 1n,
    },
  ],
};

const ctx = {} as ActionHandlerCtx;

describe("makeSafeBatchedHandler", () => {
  test("submits Safe batches using the outer batch chain", async () => {
    const send = mock(async () => undefined);
    const safeConnector = {
      getChainId: mock(async () => 100),
      getProvider: mock(async () => ({
        sdk: { txs: { send } },
      })),
    };

    await makeSafeBatchedHandler(safeConnector)(batch, ctx);

    expect(send).toHaveBeenCalledWith({
      txs: [
        {
          to: "0x0000000000000000000000000000000000000002",
          data: "0x1234",
          value: "1",
        },
      ],
    });
  });

  test("rejects Safe batches targeting a different chain", async () => {
    const safeConnector = {
      getChainId: mock(async () => 1),
      getProvider: mock(async () => ({
        sdk: { txs: { send: mock(async () => undefined) } },
      })),
    };

    await expect(
      makeSafeBatchedHandler(safeConnector)(batch, ctx),
    ).rejects.toThrow("Safe does not support switching chains");
  });

  test("reports the batch as queued in the Safe, not confirmed", async () => {
    const safeTxHash = `0x${"5a".repeat(32)}`;
    const connector = {
      getProvider: async () => ({
        sdk: { txs: { send: async () => ({ safeTxHash }) } },
      }),
      getChainId: async () => 100,
    };
    const result = await makeSafeBatchedHandler(connector)(
      {
        type: "batched",
        chainId: 100,
        from: "0x000000000000000000000000000000000000dEaD",
        actions: [
          { to: "0x1111111111111111111111111111111111111111", data: "0x" },
        ],
      },
      {} as any,
    );
    expect(result).toEqual({
      status: "queued",
      reason: `Queued in the Safe as ${safeTxHash}`,
    });
  });
});
