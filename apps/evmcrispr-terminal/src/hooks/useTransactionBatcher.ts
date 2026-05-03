import type { BatchedAction } from "@evmcrispr/core";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { useCallback } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";

import { config } from "../config/wagmi";

export function useTransactionBatcher(safeConnector?: any) {
  const executeBatchedActions = useCallback(
    async (
      batch: BatchedAction,
      currentWalletClient: WalletClient<Transport, Chain, Account>,
    ) => {
      const { actions, chainId } = batch;
      if (actions.length === 0) return;

      if (
        actions.find(
          (action) =>
            action.chainId !== undefined && action.chainId !== chainId,
        )
      ) {
        throw new Error("Batch contains transactions for multiple chains");
      }

      const chain = config.chains.find((c) => c.id === chainId);
      if (chain) {
        await currentWalletClient.switchChain({ id: chainId });
      }

      // Filter out contract deployments (no 'to' address) as they cannot be batched
      const callableActions = actions.filter(
        (action) => action.to !== undefined,
      );
      if (callableActions.length === 0) {
        throw new Error(
          "Contract deployments cannot be executed in batch mode",
        );
      }

      const { id } = await currentWalletClient.sendCalls({
        chain: config.chains.find((c) => c.id === chainId),
        forceAtomic: true,
        calls: callableActions.map((action) => ({
          to: action.to!,
          data: action.data,
          value: BigInt(action.value || "0"),
        })),
      });

      const result = await currentWalletClient.waitForCallsStatus({ id });
      if (result.status !== "success") {
        throw new Error(
          `Transaction batch failed on ${
            config.chains.find((c) => c.id === chainId)?.name || "unknown chain"
          }`,
        );
      }

      // Aggregate logs from all receipts for event capture support.
      if (result.receipts && result.receipts.length > 0) {
        const allLogs = result.receipts.flatMap((r) => r.logs);
        return { logs: allLogs };
      }

      // Wallet executed the batch but didn't return receipts (EIP-5792
      // receipts are optional). Without logs, event captures cannot be
      // resolved, so fail explicitly rather than letting downstream code
      // silently receive undefined.
      throw new Error(
        "Wallet did not return transaction receipts for the batch — event capture requires receipt logs",
      );
    },
    [],
  );

  const executeSafeBatchedActions = useCallback(
    async (batch: BatchedAction) => {
      if (!safeConnector)
        throw new Error(
          "Safe connector not available for Safe batched actions.",
        );
      const sdk = await safeConnector
        .getProvider()
        .then((provider: any) => provider.sdk as SafeAppProvider);
      if (!sdk) throw new Error("Safe SDK not available");

      const chainId = await safeConnector.getChainId();
      const { actions } = batch;

      if (
        batch.chainId !== chainId ||
        actions.find(
          (action) =>
            action.chainId !== undefined && action.chainId !== chainId,
        )
      ) {
        throw new Error("Safe does not support switching chains");
      }

      const callableActions = actions.filter(
        (action) => action.to !== undefined,
      );
      if (callableActions.length !== actions.length) {
        throw new Error(
          "Contract deployments cannot be executed in batch mode",
        );
      }

      await sdk.txs.send({
        txs: callableActions.map((action) => ({
          to: action.to as `0x${string}`,
          data: action.data,
          value: String(action.value || "0"),
        })),
      });
    },
    [safeConnector],
  );

  return {
    executeBatchedActions,
    executeSafeBatchedActions,
  };
}
