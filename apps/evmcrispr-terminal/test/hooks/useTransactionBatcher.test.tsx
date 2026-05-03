import { describe, expect, mock, test } from "bun:test";
import type { BatchedAction } from "@evmcrispr/core";
import { renderHook } from "@testing-library/react";
import { useTransactionBatcher } from "../../src/hooks/useTransactionBatcher";

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

describe("useTransactionBatcher", () => {
  test("submits Safe batches using the outer batch chain", async () => {
    const send = mock(async () => undefined);
    const safeConnector = {
      getChainId: mock(async () => 100),
      getProvider: mock(async () => ({
        sdk: { txs: { send } },
      })),
    };

    const { result } = renderHook(() => useTransactionBatcher(safeConnector));

    await result.current.executeSafeBatchedActions(batch);

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

    const { result } = renderHook(() => useTransactionBatcher(safeConnector));

    await expect(
      result.current.executeSafeBatchedActions(batch),
    ).rejects.toThrow("Safe does not support switching chains");
  });
});
