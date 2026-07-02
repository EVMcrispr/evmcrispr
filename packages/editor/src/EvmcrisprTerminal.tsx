import type { EvmlScript } from "@evmcrispr/core";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Console } from "./console/Console";
import {
  EvmcrisprProvider,
  type EvmcrisprProviderProps,
  useEvmlTag,
} from "./context/EvmcrisprProvider";
import { useScriptInterpreter } from "./hooks/useScriptInterpreter";
import { ActionsPreview } from "./preview/ActionsPreview";
import { cn } from "./ui/cn";
import { Viewer } from "./viewer/Viewer";

// Monaco (~700 KB gzipped) stays out of the initial bundle — it loads the
// first time the editor is actually rendered.
const Editor = lazy(() => import("./editor/MonacoEditor"));

export interface EvmcrisprTerminalProps
  extends Omit<EvmcrisprProviderProps, "children"> {
  /** Initial script (uncontrolled). */
  defaultScript?: string;
  /** Controlled script value — pair with `onScriptChange`. */
  script?: string;
  onScriptChange?: (script: string) => void;
  /** "edit" shows Monaco, "view" the lightweight Shiki viewer. */
  mode?: "edit" | "view";
  onModeChange?: (mode: "edit" | "view") => void;
  /** Height of the script area. The console grows below it. */
  height?: string | number;
  readOnly?: boolean;
  showConsole?: boolean;
  /** Injection point for hosts that can sign transactions. When absent the
   *  terminal runs in no-wallet mode: `Run` interprets the script with a
   *  read-only client, prints land in the console, and resolved
   *  transactions are decoded and displayed — never sent. */
  executeAction?: (
    script: EvmlScript,
    ctx: { onLog: (log: string) => void },
  ) => Promise<void>;
  className?: string;
}

function TerminalInner({
  defaultScript = "",
  script: scriptProp,
  onScriptChange,
  mode: modeProp,
  onModeChange,
  height = 320,
  readOnly,
  showConsole = true,
  executeAction,
  className,
}: Omit<
  EvmcrisprTerminalProps,
  keyof Omit<EvmcrisprProviderProps, "children">
>) {
  const tag = useEvmlTag();

  const [internalScript, setInternalScript] = useState(defaultScript);
  const script = scriptProp ?? internalScript;
  const scriptRef = useRef(script);
  scriptRef.current = script;

  const handleScriptChange = useCallback(
    (value: string) => {
      setInternalScript(value);
      onScriptChange?.(value);
    },
    [onScriptChange],
  );

  const [internalMode, setInternalMode] = useState<"edit" | "view">(
    modeProp ?? "edit",
  );
  const mode = modeProp ?? internalMode;
  const setMode = useCallback(
    (next: "edit" | "view") => {
      setInternalMode(next);
      onModeChange?.(next);
    },
    [onModeChange],
  );

  const interpreter = useScriptInterpreter();
  const [executeErrors, setExecuteErrors] = useState<string[]>([]);

  const run = useCallback(async () => {
    if (executeAction) {
      setExecuteErrors([]);
      interpreter.clearLogs();
      try {
        const evmlScript = tag
          .with({ onLog: interpreter.logListener })
          .script(scriptRef.current);
        await executeAction(evmlScript, {
          onLog: interpreter.logListener,
        });
      } catch (err) {
        setExecuteErrors([err instanceof Error ? err.message : String(err)]);
      }
      return;
    }
    await interpreter.interpret(scriptRef.current);
  }, [executeAction, interpreter, tag]);

  const errors = useMemo(
    () => [...interpreter.errors, ...executeErrors],
    [interpreter.errors, executeErrors],
  );

  return (
    <div
      className={cn(
        "evmcrispr-root dark flex flex-col border-2 border-border bg-background text-foreground font-clearer",
        className,
      )}
    >
      <div style={{ height }} className="min-h-0 shrink-0">
        {mode === "view" ? (
          <Viewer
            script={script}
            executingLine={interpreter.executingLine}
            onActivateEdit={readOnly ? undefined : () => setMode("edit")}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-foreground/40 text-sm">
                Loading editor…
              </div>
            }
          >
            <Editor
              defaultValue={script}
              onChange={handleScriptChange}
              executingLine={interpreter.executingLine}
              readOnly={readOnly}
            />
          </Suspense>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border/40 bg-evm-gray-900/50">
        <button
          type="button"
          onClick={run}
          disabled={interpreter.isRunning || script.trim().length === 0}
          className="px-4 py-1.5 bg-evm-green-300 text-evm-gray-900 font-head text-sm disabled:opacity-40 hover:bg-evm-green-500 transition-colors cursor-pointer disabled:cursor-default"
        >
          {interpreter.isRunning
            ? "Running…"
            : executeAction
              ? "Execute"
              : "Run"}
        </button>
        {!executeAction && (
          <span className="text-foreground/40 text-xs">
            read-only — transactions are shown, not sent
          </span>
        )}
      </div>

      {interpreter.actions.length > 0 && !executeAction && (
        <div className="px-3 py-2 border-t border-border/40 max-h-64 overflow-y-auto">
          <ActionsPreview actions={interpreter.actions} />
        </div>
      )}

      {showConsole && (
        <div className="border-t border-border/40 max-h-56 overflow-y-auto bg-evm-gray-900/30">
          <Console
            logs={interpreter.logs}
            errors={errors}
            placeholder="Console output will appear here when you run the script."
          />
        </div>
      )}
    </div>
  );
}

/**
 * Batteries-included embeddable EVMcrispr terminal: Monaco editor (lazy),
 * Shiki viewer, console output and — without a wallet — a decoded preview
 * of the transactions a script resolves to.
 */
export function EvmcrisprTerminal(props: EvmcrisprTerminalProps) {
  const { evml, modules, transports, chainId, account, ...rest } = props;
  return (
    <EvmcrisprProvider
      evml={evml}
      modules={modules}
      transports={transports}
      chainId={chainId}
      account={account}
    >
      <TerminalInner {...rest} />
    </EvmcrisprProvider>
  );
}
