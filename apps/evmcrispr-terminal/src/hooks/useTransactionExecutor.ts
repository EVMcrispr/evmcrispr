import type { ActionHandlers } from "@evmcrispr/core";
import { useExecutionLogs } from "@evmcrispr/editor";
import type { Action } from "@evmcrispr/sdk";
import type SafeAppProvider from "@safe-global/safe-apps-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import { browserSafeUrl } from "../config/browserSafeUrl";
import { workerEvml } from "../evml/workerEvml";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../stores/terminal-store";

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
      actions.some((action) => action.operation === 1 || action.plannedCall)
    ) {
      throw new Error(
        "The Safe Apps SDK cannot submit smart delegatecalls. Connect an owner wallet and use safe:propose <safe> !(...) or safe:execute <safe> !(...).",
      );
    }

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
  script: string,
  safeConnector?: any,
  options: { openConsoleOnExecute?: boolean; stdin?: string } = {},
) {
  const { data: walletClient } = useWalletClient();

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const { logs, logListener, clearLogs } = useExecutionLogs();
  const [output, setOutput] = useState("");
  const outputListener = useCallback(
    (text: string) => {
      logListener(text);
      setOutput((previous) => `${previous}${text}\n`);
    },
    [logListener],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<ExecutionPhase>("idle");
  const [executed, setExecuted] = useState<
    { action: Action; result?: unknown }[]
  >([]);
  const clearErrors = useCallback(() => {
    setErrors([]);
    setPhase("idle");
  }, []);

  // A finished run belongs to the script it ran against — switching scripts
  // must not keep showing its phase, logs and executed actions.
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const prevScriptIdRef = useRef(currentScriptId);
  useEffect(() => {
    if (prevScriptIdRef.current === currentScriptId) return;
    prevScriptIdRef.current = currentScriptId;
    setErrors([]);
    setPhase("idle");
    setExecuted([]);
    clearLogs();
    setOutput("");
  }, [currentScriptId, clearLogs]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const executeScript = useCallback(async () => {
    clearErrors();
    setExecuted([]);
    setPhase("preparing");
    terminalStoreActions("isLoading", true);
    if (options.openConsoleOnExecute !== false) {
      terminalStoreActions("activeTab", "console");
    }
    clearLogs();
    setOutput("");

    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      // Local commands can run without a wallet. Wallet actions update the
      // phase separately when execution actually requests one.
      let sawExecution = false;
      const evmlScript = workerEvml
        .with({
          account: address,
          stdin: options.stdin,
          onLog: logListener,
          onOutput: outputListener,
          onLine: (line: number | null) => {
            terminalStoreActions("executingLine", line);
            if (line !== null && !sawExecution) {
              sawExecution = true;
              setPhase("running");
            }
          },
        })
        .script(scriptRef.current);

      const result = await evmlScript.execute(walletClient, {
        signal: abortSignal,
        onLog: logListener,
        handlers: {
          wallet: async (action, ctx) => {
            setPhase("awaiting-wallet");
            try {
              return await ctx.next(action);
            } finally {
              setPhase("running");
            }
          },
          // Endpoints a module asks to submit through (`action.rpcUrl`)
          // are declared as the module sees them; the browser can only
          // use https, so route them like the chain RPCs.
          transaction: (action, ctx) => {
            if (!action.readOnly) setPhase("awaiting-wallet");
            return ctx.next(
              action.rpcUrl
                ? { ...action, rpcUrl: browserSafeUrl(action.rpcUrl) }
                : action,
            );
          },
          ...(safeConnector
            ? {
                batched: makeSafeBatchedHandler(safeConnector),
                smartBatch: async () => {
                  throw new Error(
                    "The Safe Apps SDK cannot submit this smart-batch route. Connect an owner wallet and use safe:propose <safe> !(...) or safe:execute <safe> !(...).",
                  );
                },
              }
            : {}),
        },
      });
      setExecuted(result.executed);
      setPhase("success");
      return true;
    } catch (err: any) {
      const e = err as Error;
      if (
        e.message === "Observation cancelled" ||
        e.message === "Execution cancelled"
      ) {
        setErrors(["Script execution cancelled"]);
        setPhase("cancelled");
      } else {
        console.error(e);
        setPhase("error");
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
      return false;
    } finally {
      terminalStoreActions("isLoading", false);
      terminalStoreActions("executingLine", null);
      abortControllerRef.current = null;
    }
  }, [
    address,
    walletClient,
    safeConnector,
    logListener,
    outputListener,
    clearLogs,
    clearErrors,
    options.openConsoleOnExecute,
    options.stdin,
  ]);

  return {
    executeScript,
    cancelExecution,
    logs,
    output,
    errors,
    clearErrors,
    phase,
    executed,
  };
}

export type ExecutionPhase =
  | "idle"
  | "preparing"
  | "running"
  | "awaiting-wallet"
  | "success"
  | "cancelled"
  | "error";
