import type { Action, TransactionAction } from "@evmcrispr/core";
import { EVMcrispr, isProviderAction, parseScript } from "@evmcrispr/core";
import { useCallback, useRef } from "react";
import type { PublicClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import { config } from "../config/wagmi";
import { terminalStoreActions } from "../stores/terminal-store";
import { switchOrAddChain } from "../utils/chain";
import { observeTransaction } from "../utils/transaction-observer";
import { useExecutionLogs } from "./useExecutionLogs";
import { useTransactionBatcher } from "./useTransactionBatcher";

export function useTransactionExecutor(
  address: `0x${string}` | undefined,
  maximizeGasLimit: boolean,
  script: string,
  safeConnector?: any,
) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const { logs, logListener, clearLogs, isLogModalOpen, closeLogModal } =
    useExecutionLogs();

  const { executeBatchedActionsWithMultiSigner, executeSafeBatchedActions } =
    useTransactionBatcher(safeConnector);

  const executeAction = useCallback(
    async (
      action: Action,
      connectedAddress: `0x${string}`,
      currentPublicClient: PublicClient,
      onStatusUpdate: (message: string) => void,
      abortSignal?: AbortSignal,
    ) => {
      if (!walletClient) throw new Error("Wallet client not available");

      if (isProviderAction(action)) {
        const chainId = Number(action.params[0].chainId);
        await switchOrAddChain(walletClient, chainId);
      } else {
        const actionFrom = action.from?.toLowerCase();
        const isOurTransaction =
          !actionFrom || actionFrom === connectedAddress.toLowerCase();

        if (isOurTransaction) {
          const chainId = await walletClient.getChainId();
          const tx = await walletClient.sendTransaction({
            chain: config.chains.find((chain) => chain.id === chainId),
            to: action.to,
            from: action.from,
            data: action.data,
            value: action.value,
            gasLimit: maximizeGasLimit ? 10_000_000n : undefined,
          });
          await currentPublicClient.waitForTransactionReceipt({ hash: tx });
        } else {
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
    [walletClient, maximizeGasLimit],
  );

  // AbortController for cancelling transaction observations
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const executeScript = useCallback(
    async (inBatch: boolean) => {
      terminalStoreActions("errors", []);
      terminalStoreActions("isLoading", true);
      clearLogs();

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;

      try {
        if (!address || !publicClient || !walletClient) {
          throw new Error("Account not connected or clients not available");
        }

        const { ast, errors: parseErrors } = parseScript(script);

        if (parseErrors.length) {
          terminalStoreActions("errors", parseErrors);
          return;
        }

        const batched: TransactionAction[] = [];
        let currentChainId = await walletClient.getChainId();

        await new EVMcrispr(
          ast,
          async () => publicClient,
          async () => address,
        )
          .registerLogListener(logListener)
          .interpret(async (action: Action) => {
            if (inBatch) {
              if (isProviderAction(action)) {
                currentChainId = Number(action.params[0].chainId);
              } else {
                batched.push({ chainId: currentChainId, ...action });
              }
            } else {
              await executeAction(
                action,
                address,
                publicClient,
                logListener,
                abortSignal,
              );
            }
          });

        if (batched.length) {
          const hasOtherSigners = batched.some((action) => {
            const actionFrom = action.from?.toLowerCase();
            return actionFrom && actionFrom !== address.toLowerCase();
          });

          if (safeConnector) {
            if (hasOtherSigners) {
              throw new Error(
                "Safe batch mode does not support multi-signer coordination. " +
                  "Use non-batch mode to wait for other signers' transactions.",
              );
            }
            await executeSafeBatchedActions(batched);
          } else {
            await executeBatchedActionsWithMultiSigner(
              batched,
              walletClient,
              maximizeGasLimit,
              address,
              publicClient,
              logListener,
              abortSignal,
            );
          }
        }
      } catch (err: any) {
        const e = err as Error;
        if (e.message === "Observation cancelled") {
          terminalStoreActions("errors", ["Script execution cancelled"]);
        } else {
          console.error(e);
          if (
            e.message.startsWith("transaction failed") &&
            /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
          ) {
            terminalStoreActions("errors", [
              `Transaction failed, watch in block explorer ${e.message.split('"')[1]}`,
            ]);
          } else {
            terminalStoreActions("errors", [e.message]);
          }
        }
      } finally {
        terminalStoreActions("isLoading", false);
        abortControllerRef.current = null;
      }
    },
    [
      address,
      publicClient,
      walletClient,
      script,
      maximizeGasLimit,
      logListener,
      clearLogs,
      executeAction,
      executeBatchedActionsWithMultiSigner,
      executeSafeBatchedActions,
      safeConnector,
    ],
  );

  return {
    executeScript,
    cancelExecution,
    logs,
    isLogModalOpen,
    closeLogModal,
  };
}
