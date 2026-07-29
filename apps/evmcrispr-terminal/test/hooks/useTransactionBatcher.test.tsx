import { describe, expect, mock, test } from "bun:test";
import type { ActionHandlerCtx, BatchedAction } from "@evmcrispr/core";
import { makeSafeBatchedHandler } from "../../src/hooks/useTransactionExecutor";

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
});
