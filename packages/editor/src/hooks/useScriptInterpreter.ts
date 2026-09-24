import type { Action } from "@evmcrispr/core";
import { useCallback, useRef, useState } from "react";
import { useEvmlTag } from "../context/EvmcrisprProvider";
import { useExecutionLogs } from "./useExecutionLogs";

/**
 * No-wallet run path: interpret a script with a read-only public client.
 * `print`-style output lands in `logs`; resolved actions (`exec`, `send`,
 * `batch`, …) are collected for display — nothing is ever sent on-chain.
 */
export function useScriptInterpreter() {
  const tag = useEvmlTag();

  const { entries, logs, logListener, boxListener, clearLogs } =
    useExecutionLogs();
  const [errors, setErrors] = useState<string[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [executingLine, setExecutingLine] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const clearErrors = useCallback(() => setErrors([]), []);

  const interpret = useCallback(
    async (script: string) => {
      clearLogs();
      setErrors([]);
      setActions([]);
      setIsRunning(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const evmlScript = tag
          .with({
            onLog: logListener,
            onBox: boxListener,
            onLine: setExecutingLine,
          })
          .script(script);

        const resolved = await evmlScript.interpret({
          signal: controller.signal,
        });
        setActions(resolved);
        return resolved;
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
        return [];
      } finally {
        setIsRunning(false);
        setExecutingLine(null);
      }
    },
    [tag, logListener, boxListener, clearLogs],
  );

  return {
    interpret,
    isRunning,
    executingLine,
    actions,
    entries,
    logs,
    logListener,
    boxListener,
    errors,
    clearLogs,
    clearErrors,
  };
}
