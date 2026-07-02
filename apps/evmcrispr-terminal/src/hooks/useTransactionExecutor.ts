import type { ActionHandlers } from "@evmcrispr/core";
import { evml } from "@evmcrispr/core";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { useCallback, useRef, useState } from "react";
import { useWalletClient } from "wagmi";

import { transports } from "../config/wagmi";
import { terminalStoreActions } from "../stores/terminal-store";
import { useExecutionLogs } from "./useExecutionLogs";

/** Safe apps can't use EIP-5792 batching — route batched actions through
 *  the Safe SDK instead. Non-Safe runs use the core default handler. */
export function makeSafeBatchedHandler(
  safeConnector: any,
): ActionHandlers["batched"] {
  return async (batch, _ctx) => {
    const sdk = await safeConnector
      .getProvider()
      .then((provider: any) => provider.sdk as SafeAppProvider);
    if (!sdk) throw new Error("Safe SDK not available");

    const chainId = await safeConnector.getChainId();
    const { actions } = batch;

    if (
      batch.chainId !== chainId ||
      actions.find(
        (action) => action.chainId !== undefined && action.chainId !== chainId,
      )
    ) {
      throw new Error("Safe does not support switching chains");
    }

    const callableActions = actions.filter((action) => action.to !== undefined);
    if (callableActions.length !== actions.length) {
      throw new Error("Contract deployments cannot be executed in batch mode");
    }

    await sdk.txs.send({
      txs: callableActions.map((action) => ({
        to: action.to as `0x${string}`,
        data: action.data,
        value: String(action.value || "0"),
      })),
    });
  };
}

export function useTransactionExecutor(
  address: `0x${string}` | undefined,
  maximizeGasLimit: boolean,
  script: string,
  safeConnector?: any,
) {
  const { data: walletClient } = useWalletClient();

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const { logs, logListener, clearLogs } = useExecutionLogs();
  const [errors, setErrors] = useState<string[]>([]);
  const clearErrors = useCallback(() => setErrors([]), []);

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
      if (!walletClient) {
        throw new Error(
          "Wallet connection required to sign transactions. Connect a wallet and try again.",
        );
      }

      const evmlScript = evml
        .with({
          account: address,
          transports,
          onLog: logListener,
          onLine: (line: number | null) =>
            terminalStoreActions("executingLine", line),
        })
        .script(scriptRef.current);

      await evmlScript.execute(walletClient, {
        signal: abortSignal,
        maximizeGasLimit,
        onLog: logListener,
        handlers: safeConnector
          ? { batched: makeSafeBatchedHandler(safeConnector) }
          : undefined,
      });
    } catch (err: any) {
      const e = err as Error;
      if (e.message === "Observation cancelled") {
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
    walletClient,
    maximizeGasLimit,
    safeConnector,
    logListener,
    clearLogs,
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
