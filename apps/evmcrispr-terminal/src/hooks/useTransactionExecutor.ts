import type { Action } from "@evmcrispr/core";
import { EVMcrispr, HaltExecution, isTransactionAction } from "@evmcrispr/core";
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

  const { executeBatchedActions, executeSafeBatchedActions } =
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

      if (isTransactionAction(action)) {
        const actionFrom = action.from?.toLowerCase();
        const isOurTransaction =
          !actionFrom || actionFrom === connectedAddress.toLowerCase();

        if (isOurTransaction) {
          const chainId = await walletClient.getChainId();

          // Determine gas limit: explicit --gas > maximizeGasLimit (EIP-7825) > undefined (let wallet estimate)
          let gasLimit: bigint | undefined = action.gas;
          if (!gasLimit && maximizeGasLimit) {
            gasLimit = 16_777_216n; // EIP-7825 gas limit, other chains may have different limits. Check again when EIP-8123 approved.
          }

          const tx = await walletClient.sendTransaction({
            chain: config.chains.find((chain) => chain.id === chainId),
            to: action.to,
            from: action.from,
            data: action.data,
            value: action.value,
            gas: gasLimit,
            maxFeePerGas: action.maxFeePerGas,
            maxPriorityFeePerGas: action.maxPriorityFeePerGas,
            nonce: action.nonce,
          });
          return await currentPublicClient.waitForTransactionReceipt({
            hash: tx,
          });
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
      } else {
        switch (action.type) {
          case "batched": {
            if (safeConnector) {
              await executeSafeBatchedActions(action.actions);
            } else {
              return await executeBatchedActions(action.actions, walletClient);
            }
            break;
          }

          case "wallet": {
            if (action.method === "wallet_switchEthereumChain") {
              const chainId = Number(action.params[0].chainId);
              await switchOrAddChain(walletClient, chainId);
            } else {
              return await walletClient.request({
                method: action.method as any,
                params: action.params as any,
              });
            }
            break;
          }

          case "rpc": {
            return await currentPublicClient.request({
              method: action.method as any,
              params: action.params as any,
            });
          }

          case "terminal": {
            if (action.command === "halt") {
              throw new HaltExecution();
            }
            onStatusUpdate(
              `Terminal action: ${action.command} ${JSON.stringify(
                action.args,
              )}`,
            );
            break;
          }
        }
      }
    },
    [
      walletClient,
      maximizeGasLimit,
      safeConnector,
      executeBatchedActions,
      executeSafeBatchedActions,
    ],
  );

  // AbortController for cancelling transaction observations
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const executeScript = useCallback(async () => {
    terminalStoreActions("errors", []);
    terminalStoreActions("isLoading", true);
    clearLogs();

    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      if (!address || !publicClient || !walletClient) {
        throw new Error("Account not connected or clients not available");
      }

      const evm = new EVMcrispr(publicClient, address);
      evm.registerLogListener(logListener);

      await evm.interpret(script, async (action: Action) => {
        return await executeAction(
          action,
          address,
          publicClient,
          logListener,
          abortSignal,
        );
      });
    } catch (err: any) {
      const e = err as Error;
      if (err instanceof HaltExecution) {
        console.log("HaltExecution");
        // Clean halt — not an error
      } else if (e.message === "Observation cancelled") {
        terminalStoreActions("errors", ["Script execution cancelled"]);
      } else {
        console.error(e);
        if (
          e.message.startsWith("transaction failed") &&
          /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
        ) {
          terminalStoreActions("errors", [
            `Transaction failed, watch in block explorer ${
              e.message.split('"')[1]
            }`,
          ]);
        } else {
          terminalStoreActions("errors", [e.message]);
        }
      }
    } finally {
      terminalStoreActions("isLoading", false);
      abortControllerRef.current = null;
    }
  }, [
    address,
    publicClient,
    walletClient,
    script,
    logListener,
    clearLogs,
    executeAction,
  ]);

  return {
    executeScript,
    cancelExecution,
    logs,
    isLogModalOpen,
    closeLogModal,
  };
}
