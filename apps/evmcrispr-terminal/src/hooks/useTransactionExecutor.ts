import type { ActionHandlers } from "@evmcrispr/core";
import { classifyError } from "@evmcrispr/core";
import { useExecutionLogs } from "@evmcrispr/editor";
import type { Action, BoxSnapshot } from "@evmcrispr/sdk";
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

    const sent = await sdk.txs.send({
      txs: callableActions.map((action) => ({
        to: action.to as `0x${string}`,
        data: action.data,
        value: String(action.value || "0"),
      })),
    });
    // The Safe only queued the batch: its owners execute it later. The
    // transaction box says so, and boxes following the batch do not treat
    // it as mined.
    const safeTxHash: string | undefined = sent?.safeTxHash;
    return {
      status: "queued",
      reason: safeTxHash
        ? `Queued in the Safe as ${safeTxHash}`
        : "Queued in the Safe",
    };
  };
}

/** Live status boxes the run follows after the script ends. Simulated
 *  boxes never hold a run, so they never count. Updated synchronously from
 *  `onBox`, so `onLine(null)` sees every snapshot sent before it. */
export function trackFollowedBoxes() {
  const live = new Set<string>();
  return {
    update(snapshot: BoxSnapshot): number {
      if (snapshot.state === "live" && !snapshot.simulated)
        live.add(snapshot.id);
      else live.delete(snapshot.id);
      return live.size;
    },
    get size() {
      return live.size;
    },
    clear() {
      live.clear();
    },
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

  const { entries, logs, logListener, boxListener, endLiveBoxes, clearLogs } =
    useExecutionLogs();
  // Read from `onLine`, a closure that outlives renders: a ref, not state.
  const followedRef = useRef(trackFollowedBoxes());
  const [followingBoxes, setFollowingBoxes] = useState(0);
  const followBox = useCallback(
    (snapshot: BoxSnapshot) => {
      boxListener(snapshot);
      setFollowingBoxes(followedRef.current.update(snapshot));
    },
    [boxListener],
  );
  const clearFollowed = useCallback(() => {
    followedRef.current.clear();
    setFollowingBoxes(0);
  }, []);
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

  // The run in flight, if any. A run can follow live boxes for hours, so
  // it is the one thing that gates a new run, not the phase.
  const runRef = useRef<Run | null>(null);

  const cancelExecution = useCallback(() => {
    runRef.current?.controller.abort();
  }, []);

  // A run belongs to the script it ran against: switching scripts cancels
  // a run still in flight (it may be watching boxes for hours) and drops
  // its phase, logs and executed actions. Whatever the cancelled run still
  // reports while it unwinds is ignored.
  const currentScriptId = useTerminalStore((s) => s.currentScriptId);
  const prevScriptIdRef = useRef(currentScriptId);
  useEffect(() => {
    if (prevScriptIdRef.current === currentScriptId) return;
    prevScriptIdRef.current = currentScriptId;
    const run = runRef.current;
    if (run) {
      runRef.current = null;
      run.controller.abort();
      terminalStoreActions("isLoading", false);
      terminalStoreActions("executingLine", null);
    }
    setErrors([]);
    setPhase("idle");
    setExecuted([]);
    clearLogs();
    clearFollowed();
    setOutput("");
  }, [currentScriptId, clearLogs, clearFollowed]);

  const executeScript = useCallback(async () => {
    // One run at a time: a run still in flight (even one only watching
    // boxes) is cancelled first, never overlapped.
    if (runRef.current) return false;
    const run: Run = { controller: new AbortController() };
    runRef.current = run;
    const current = () => runRef.current === run;
    // Callbacks of a run that is no longer current (the script switched)
    // must not touch the state the new script shows.
    const guard =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (current()) fn(...args);
      };
    const onLog = guard(logListener);
    const onBox = guard(followBox);
    const onOutput = guard(outputListener);
    const setRunPhase = guard(setPhase);

    clearErrors();
    setExecuted([]);
    setPhase("preparing");
    terminalStoreActions("isLoading", true);
    if (options.openConsoleOnExecute !== false) {
      terminalStoreActions("activeTab", "console");
    }
    clearLogs();
    clearFollowed();
    setOutput("");

    const abortSignal = run.controller.signal;

    try {
      // Local commands can run without a wallet. Wallet actions update the
      // phase separately when execution actually requests one.
      let sawExecution = false;
      const evmlScript = workerEvml
        .with({
          account: address,
          stdin: options.stdin,
          onLog,
          onBox,
          onOutput,
          onLine: (line: number | null) => {
            if (!current()) return;
            terminalStoreActions("executingLine", line);
            if (line !== null && !sawExecution) {
              sawExecution = true;
              setPhase("running");
            }
            // The script ended but boxes it opened are still followed:
            // the run stays open (and cancellable) until they end.
            if (line === null && followedRef.current.size > 0)
              setPhase("watching");
          },
        })
        .script(scriptRef.current);

      const result = await evmlScript.execute(walletClient, {
        signal: abortSignal,
        onLog,
        handlers: {
          wallet: async (action, ctx) => {
            setRunPhase("awaiting-wallet");
            try {
              return await ctx.next(action);
            } finally {
              setRunPhase("running");
            }
          },
          // Endpoints a module asks to submit through (`action.rpcUrl`)
          // are declared as the module sees them; the browser can only
          // use https, so route them like the chain RPCs.
          transaction: (action, ctx) => {
            if (!action.readOnly) setRunPhase("awaiting-wallet");
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
      if (!current()) return false;
      setExecuted(result.executed);
      setPhase("success");
      return true;
    } catch (err: any) {
      if (!current()) return false;
      const e = err as Error;
      // Rejecting in the wallet is a choice, not a failure: the transaction
      // box already reads "Rejected in wallet", so no error text follows.
      const rejected = classifyError(err).kind === "rejected";
      const cancelled =
        rejected ||
        e.message === "Observation cancelled" ||
        e.message === "Execution cancelled";
      // A rejected run sends no more snapshots: when its worker was killed
      // (the kill grace after a cancel ran out) or crashed, boxes it left
      // live would show "In progress" forever. End them here; boxes the
      // core already ended keep their own ending.
      endLiveBoxes(
        cancelled
          ? "Stopped following"
          : "Stopped following: the script stopped unexpectedly",
      );
      clearFollowed();
      if (cancelled) {
        setErrors(rejected ? [] : ["Script execution cancelled"]);
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
      if (current()) {
        runRef.current = null;
        terminalStoreActions("isLoading", false);
        terminalStoreActions("executingLine", null);
      }
    }
  }, [
    address,
    walletClient,
    safeConnector,
    logListener,
    followBox,
    endLiveBoxes,
    outputListener,
    clearLogs,
    clearFollowed,
    clearErrors,
    options.openConsoleOnExecute,
    options.stdin,
  ]);

  return {
    executeScript,
    cancelExecution,
    entries,
    logs,
    followingBoxes,
    output,
    errors,
    clearErrors,
    phase,
    executed,
  };
}

interface Run {
  controller: AbortController;
}

export type ExecutionPhase =
  | "idle"
  | "preparing"
  | "running"
  | "awaiting-wallet"
  /** The script ended; the run follows live status boxes until they end. */
  | "watching"
  | "success"
  | "cancelled"
  | "error";
