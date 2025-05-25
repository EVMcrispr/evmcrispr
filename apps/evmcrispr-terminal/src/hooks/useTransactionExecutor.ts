import { useCallback, useState } from "react";
import type { Action, TransactionAction } from "@1hive/evmcrispr";
import { EVMcrispr, isProviderAction, parseScript } from "@1hive/evmcrispr";
import { usePublicClient, useWalletClient } from "wagmi";
import type { Account, Chain, Transport, WalletClient } from "viem";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";

import { config } from "../wagmi";
import { terminalStoreActions } from "../components/TerminalEditor/use-terminal-store";

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
    ) => {
      if (isProviderAction(action)) {
        const chainId = Number(action.params[0].chainId);
        await switchOrAddChain(currentWalletClient, chainId);
      } else {
        if (!publicClient)
          throw new Error(
            "Public client not available for waiting for transaction receipt.",
          );
        const chainId = await currentWalletClient.getChainId();
        const tx = await currentWalletClient.sendTransaction({
          chain: config.chains.find((chain) => chain.id === chainId),
          to: action.to,
          from: action.from,
          data: action.data,
          value: action.value,
          gasLimit: currentMaximizeGasLimit ? 10_000_000n : undefined,
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
    },
    [publicClient],
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
        const { id } = await currentWalletClient.sendCalls({
          chain: config.chains.find((chain) => chain.id === group[0].chainId),
          forceAtomic: true,
          calls: group.map((action) => ({
            to: action.to,
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

  const executeScript = useCallback(
    async (inBatch: boolean) => {
      terminalStoreActions("errors", []);
      terminalStoreActions("isLoading", true);
      setLogs([]);

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
              await executeAction(action, walletClient, maximizeGasLimit);
            }
          });

        if (batched.length) {
          if (safeConnector) {
            await executeSafeBatchedActions(batched);
          } else {
            await executeBatchedActions(
              batched,
              walletClient,
              maximizeGasLimit,
            );
          }
        }
      } catch (err: any) {
        const e = err as Error;
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
      } finally {
        terminalStoreActions("isLoading", false);
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
      executeBatchedActions,
      executeSafeBatchedActions,
      safeConnector,
    ],
  );

  return {
    executeScript,
    logs,
  };
}
