import type { Action } from "@evmcrispr/core";
import { EVMcrispr, HaltExecution, isTransactionAction } from "@evmcrispr/core";
import { useCallback, useRef, useState } from "react";
import type { PublicClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

import { config, transports } from "../config/wagmi";
import { terminalStoreActions } from "../stores/terminal-store";
import { switchOrAddChain } from "../utils/chain";
import { observeTransaction } from "../utils/transaction-observer";
import { useExecutionLogs } from "./useExecutionLogs";
import { useTransactionBatcher } from "./useTransactionBatcher";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function useTransactionExecutor(
  address: `0x${string}` | undefined,
  maximizeGasLimit: boolean,
  script: string,
  safeConnector?: any,
) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const { logs, logListener, clearLogs } = useExecutionLogs();
  const [errors, setErrors] = useState<string[]>([]);
  const clearErrors = useCallback(() => setErrors([]), []);

  const { executeBatchedActions, executeSafeBatchedActions } =
    useTransactionBatcher(safeConnector);

  const executeAction = useCallback(
    async (
      action: Action,
      connectedAddress: `0x${string}` | undefined,
      currentPublicClient: PublicClient,
      onStatusUpdate: (message: string) => void,
      abortSignal?: AbortSignal,
    ) => {
      if (isTransactionAction(action)) {
        const actionFrom = action.from?.toLowerCase();
        const isOurTransaction =
          !actionFrom ||
          (connectedAddress && actionFrom === connectedAddress.toLowerCase());

        if (isOurTransaction) {
          if (!walletClient) {
            throw new Error(
              "Wallet connection required to sign transactions. Connect a wallet and try again.",
            );
          }

          onStatusUpdate(
            `Sending transaction to ${truncateAddress(action.to)}`,
          );

          const chainId = await walletClient.getChainId();

          let gasLimit: bigint | undefined = action.gas;
          if (!gasLimit && maximizeGasLimit) {
            gasLimit = 16_777_216n;
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
          const receipt = await currentPublicClient.waitForTransactionReceipt({
            hash: tx,
          });
          onStatusUpdate(
            `:success:Transaction confirmed: [${tx.slice(0, 10)}...](${tx})`,
          );
          return receipt;
        } else {
          if (!action.to) {
            throw new Error(
              "Cannot observe contract deployment transactions from other signers",
            );
          }
          onStatusUpdate(
            `:waiting:Waiting for ${truncateAddress(action.from!)} to execute transaction to ${truncateAddress(action.to)}`,
          );
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
            if (!walletClient) {
              throw new Error(
                "Wallet connection required to send batched transactions. Connect a wallet and try again.",
              );
            }
            onStatusUpdate(
              `Executing batch of ${action.actions.length} transactions from ${truncateAddress(action.from)}`,
            );
            if (safeConnector) {
              await executeSafeBatchedActions(action.actions);
            } else {
              return await executeBatchedActions(action.actions, walletClient);
            }
            break;
          }

          case "wallet": {
            onStatusUpdate(`Requesting wallet: ${action.method}`);
            if (action.method === "wallet_switchEthereumChain") {
              if (walletClient) {
                const chainId = Number(action.params[0].chainId);
                await switchOrAddChain(walletClient, chainId);
              }
            } else {
              if (!walletClient) {
                throw new Error(
                  "Wallet connection required for wallet actions. Connect a wallet and try again.",
                );
              }
              return await walletClient.request({
                method: action.method as any,
                params: action.params as any,
              });
            }
            break;
          }

          case "rpc": {
            onStatusUpdate(`RPC call: ${action.method}`);
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

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const executeScript = useCallback(async () => {
    clearErrors();
    terminalStoreActions("isLoading", true);
    terminalStoreActions("activeTab", "console");
    clearLogs();

    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const evm = new EVMcrispr(publicClient, address, transports);
      evm.registerLogListener(logListener);
      evm.registerLineListener((line: number | null) =>
        terminalStoreActions("executingLine", line),
      );

      await evm.interpret(scriptRef.current, async (action: Action) => {
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
        // Clean halt — not an error
      } else if (e.message === "Observation cancelled") {
        setErrors(["Script execution cancelled"]);
      } else {
        console.error(e);
        if (
          e.message.startsWith("transaction failed") &&
          /^0x[0-9a-f]{64}$/.test(e.message.split('"')[1])
        ) {
          setErrors([
            `Transaction failed, watch in block explorer ${
              e.message.split('"')[1]
            }`,
          ]);
        } else {
          setErrors([e.message]);
        }
      }
    } finally {
      terminalStoreActions("isLoading", false);
      terminalStoreActions("executingLine", null);
      abortControllerRef.current = null;
    }
  }, [
    address,
    publicClient,
    logListener,
    clearLogs,
    executeAction,
    clearErrors,
  ]);

  return {
    executeScript,
    cancelExecution,
    logs,
    errors,
    clearErrors,
  };
}
