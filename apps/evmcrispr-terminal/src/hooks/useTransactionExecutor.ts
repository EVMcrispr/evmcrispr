import { useCallback, useRef, useState } from "react";
import type { Action, TransactionAction } from "@1hive/evmcrispr";
import { EVMcrispr, isProviderAction, parseScript } from "@1hive/evmcrispr";
import { usePublicClient, useWalletClient } from "wagmi";
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";

import { config } from "../wagmi";
import { terminalStoreActions } from "../components/TerminalEditor/use-terminal-store";
import { observeTransaction } from "../utils/transaction-observer";

async function switchOrAddChain(
  walletClient: WalletClient<Transport, Chain, Account>,
  chainId: number,
) {
  try {
    await walletClient.switchChain({ id: chainId });
  } catch (e: any) {
    const newChain = config.chains.find((c) => c.id === chainId);
    if (newChain) {
      try {
        await (walletClient as any).addChain({ chain: newChain });
        await walletClient.switchChain({ id: chainId });
      } catch (addError) {
        console.error("Failed to add or switch chain:", addError);
        throw new Error(
          `Failed to switch to chain ${chainId}. Please add it manually.`,
        );
      }
    } else {
      throw new Error(`Chain with id ${chainId} not configured.`);
    }
  }
}

export function useTransactionExecutor(
  address: `0x${string}` | undefined,
  maximizeGasLimit: boolean,
  script: string,
  safeConnector?: any,
) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [logs, setLogs] = useState<string[]>([]);

  const logListener = useCallback((log: string) => {
    setLogs((prevLogs) => [...prevLogs, log]);
  }, []);

  const executeAction = useCallback(
    async (
      action: Action,
      currentWalletClient: WalletClient<Transport, Chain, Account>,
      currentMaximizeGasLimit: boolean,
      connectedAddress: `0x${string}`,
      currentPublicClient: PublicClient,
      onStatusUpdate: (message: string) => void,
      abortSignal?: AbortSignal,
    ) => {
      if (isProviderAction(action)) {
        const chainId = Number(action.params[0].chainId);
        await switchOrAddChain(currentWalletClient, chainId);
      } else {
        // Check if this is our transaction or someone else's
        const actionFrom = action.from?.toLowerCase();
        const isOurTransaction =
          !actionFrom || actionFrom === connectedAddress.toLowerCase();

        if (isOurTransaction) {
          // Execute the transaction ourselves
          const chainId = await currentWalletClient.getChainId();
          const tx = await currentWalletClient.sendTransaction({
            chain: config.chains.find((chain) => chain.id === chainId),
            to: action.to,
            from: action.from,
            data: action.data,
            value: action.value,
            gasLimit: currentMaximizeGasLimit ? 10_000_000n : undefined,
          });
          await currentPublicClient.waitForTransactionReceipt({ hash: tx });
        } else {
          // Wait for transaction from another signer
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
    [],
  );

  /**
   * Groups actions by signer (our transactions vs other signers' transactions)
   * and by chainId for proper batching with multi-signer support.
   */
  type ActionGroup =
    | { type: "execute"; actions: TransactionAction[] }
    | { type: "observe"; action: TransactionAction };

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
        if (groupedActions.length == 0) {
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

  // AbortController for cancelling transaction observations
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const executeScript = useCallback(
    async (inBatch: boolean) => {
      terminalStoreActions("errors", []);
      terminalStoreActions("isLoading", true);
      setLogs([]);

      // Create a new AbortController for this execution
      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;

      try {
        if (!address || !publicClient || !walletClient) {
          throw new Error("Account not connected or clients not available");
        }

        const { ast, errors: parseErrors } = parseScript(script);

        if (parseErrors.length) {
          terminalStoreActions("errors", parseErrors);
          return; // Don't set isLoading to false here, finally block will do it.
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
                walletClient,
                maximizeGasLimit,
                address,
                publicClient,
                logListener,
                abortSignal,
              );
            }
          });

        if (batched.length) {
          // Check if there are any transactions from other signers
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
        // Don't log cancellation as an error
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
  };
}
