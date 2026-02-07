import type { TransactionAction } from "@1hive/evmcrispr";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { useCallback } from "react";
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";

import { config } from "../config/wagmi";
import { switchOrAddChain } from "../utils/chain";
import { observeTransaction } from "../utils/transaction-observer";

/**
 * Groups actions by signer (our transactions vs other signers' transactions)
 * and by chainId for proper batching with multi-signer support.
 */
export type ActionGroup =
  | { type: "execute"; actions: TransactionAction[] }
  | { type: "observe"; action: TransactionAction };

export function useTransactionBatcher(safeConnector?: any) {
  const groupActionsBySigner = useCallback(
    (
      actions: TransactionAction[],
      connectedAddress: `0x${string}`,
    ): ActionGroup[] => {
      const groups: ActionGroup[] = [];

      for (const action of actions) {
        const actionFrom = action.from?.toLowerCase();
        const isOurTransaction =
          !actionFrom || actionFrom === connectedAddress.toLowerCase();

        if (isOurTransaction) {
          // Check if we can add to the last group (same type and chainId)
          const lastGroup = groups[groups.length - 1];
          if (
            lastGroup?.type === "execute" &&
            lastGroup.actions[0].chainId === action.chainId
          ) {
            lastGroup.actions.push(action);
          } else {
            groups.push({ type: "execute", actions: [action] });
          }
        } else {
          // Other signer's transaction - must be observed individually
          groups.push({ type: "observe", action });
        }
      }

      return groups;
    },
    [],
  );

  const executeBatchedActions = useCallback(
    async (
      actions: TransactionAction[],
      currentWalletClient: WalletClient<Transport, Chain, Account>,
      currentMaximizeGasLimit: boolean,
    ) => {
      const groupedActions: TransactionAction[][] = [];
      actions.forEach((action) => {
        if (groupedActions.length === 0) {
          groupedActions.push([action]);
        } else {
          const lastGroup = groupedActions[groupedActions.length - 1];
          if (lastGroup[0].chainId === action.chainId) {
            lastGroup.push(action);
          } else {
            groupedActions.push([action]);
          }
        }
      });
      for (const group of groupedActions) {
        if (group[0].chainId !== undefined) {
          await switchOrAddChain(currentWalletClient, group[0].chainId);
        }
        // Filter out contract deployments (no 'to' address) as they cannot be batched
        const callableActions = group.filter(
          (action) => action.to !== undefined,
        );
        if (callableActions.length === 0) {
          throw new Error(
            "Contract deployments cannot be executed in batch mode",
          );
        }
        const { id } = await currentWalletClient.sendCalls({
          chain: config.chains.find((chain) => chain.id === group[0].chainId),
          forceAtomic: true,
          calls: callableActions.map((action) => ({
            to: action.to!,
            data: action.data,
            value: BigInt(action.value || "0"),
            gasLimit: currentMaximizeGasLimit ? 10_000_000n : undefined,
          })),
        });
        const { status } = await currentWalletClient.waitForCallsStatus({ id });
        if (status !== "success") {
          throw new Error(
            `Transaction batch failed on ${config.chains.find((chain) => chain.id === group[0].chainId)?.name || "unknown chain"}`,
          );
        }
      }
    },
    [],
  );

  /**
   * Execute batched actions with multi-signer support.
   * Our transactions are batched together, other signers' transactions are observed.
   */
  const executeBatchedActionsWithMultiSigner = useCallback(
    async (
      actions: TransactionAction[],
      currentWalletClient: WalletClient<Transport, Chain, Account>,
      currentMaximizeGasLimit: boolean,
      connectedAddress: `0x${string}`,
      currentPublicClient: PublicClient,
      onStatusUpdate: (message: string) => void,
      abortSignal?: AbortSignal,
    ) => {
      const groups = groupActionsBySigner(actions, connectedAddress);

      for (const group of groups) {
        if (abortSignal?.aborted) {
          throw new Error("Observation cancelled");
        }

        if (group.type === "execute") {
          // Execute our batch of transactions
          await executeBatchedActions(
            group.actions,
            currentWalletClient,
            currentMaximizeGasLimit,
          );
        } else {
          // Observe other signer's transaction
          const action = group.action;
          if (!action.to) {
            throw new Error(
              "Cannot observe contract deployment transactions from other signers",
            );
          }
          await observeTransaction({
            to: action.to,
            data: action.data,
            from: action.from!,
            publicClient: currentPublicClient,
            onStatusUpdate,
            signal: abortSignal,
          });
        }
      }
    },
    [groupActionsBySigner, executeBatchedActions],
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
    executeBatchedActionsWithMultiSigner,
    executeSafeBatchedActions,
  };
}
