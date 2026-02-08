import type { TransactionAction } from "@evmcrispr/core";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { useCallback } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";

import { config } from "../config/wagmi";

export function useTransactionBatcher(safeConnector?: any) {
  const executeBatchedActions = useCallback(
    async (
      actions: TransactionAction[],
      currentWalletClient: WalletClient<Transport, Chain, Account>,
      currentMaximizeGasLimit: boolean,
    ) => {
      if (actions.length === 0) return;

      const chainId = actions[0].chainId;

      if (chainId !== undefined) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (chain) {
          await currentWalletClient.switchChain({ id: chainId });
        }
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
          gasLimit: currentMaximizeGasLimit ? 10_000_000n : undefined,
        })),
      });

      const result = await currentWalletClient.waitForCallsStatus({ id });
      if (result.status !== "success") {
        throw new Error(
          `Transaction batch failed on ${config.chains.find((c) => c.id === chainId)?.name || "unknown chain"}`,
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
    async (actions: TransactionAction[]) => {
      if (!safeConnector)
        throw new Error(
          "Safe connector not available for Safe batched actions.",
        );
      const sdk = await safeConnector
        .getProvider()
        .then((provider: any) => provider.sdk as SafeAppProvider);
      if (!sdk) throw new Error("Safe SDK not available");

      const chainId = await safeConnector.getChainId();

      if (actions.find((action) => action.chainId !== chainId)) {
        throw new Error("Safe does not support switching chains");
      }

      await sdk.txs.send({
        txs: actions.map((action) => ({
          to: action.to,
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
