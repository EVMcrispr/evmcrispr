import type { EvmlScript } from "@evmcrispr/core";
import { XMarkIcon } from "@heroicons/react/24/outline";
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
  /** Height of the script area. The console grows below it. Pass "fill"
   *  to let the script area flex into whatever height the host gives the
   *  terminal (e.g. via `className="h-full"`). */
  height?: string | number;
  /** Font size (px) of the script. Applied to both the Shiki viewer and
   *  Monaco so toggling view ↔ edit never reflows. Defaults to 22. */
  fontSize?: number;
  /** Exact background color of the script surface (e.g. "#121212").
   *  Hosts retinting the terminal (via className / CSS vars) must pass the
   *  same color here: Monaco can't inherit it and needs an opaque value —
   *  a transparent surface breaks features that paint over the text, like
   *  sticky scroll and the find widget. Defaults to the black theme. */
  editorBackground?: string;
  readOnly?: boolean;
  /** Show the console strip below the terminal. Only applies when
   *  `executeAction` is set — in no-wallet mode output lives in the
   *  simulation drawer instead. */
  showConsole?: boolean;
  /** Injection point for hosts that can sign transactions. When absent the
   *  terminal runs in no-wallet mode: `Simulate` interprets the script with
   *  a read-only client and a drawer slides up over the script showing the
   *  decoded transactions and console output — nothing is ever sent. */
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
  fontSize,
  editorBackground,
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
  // No-wallet mode: simulation results slide up in a drawer over the script.
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    setDrawerOpen(true);
    await interpreter.interpret(scriptRef.current);
  }, [executeAction, interpreter, tag]);

  const errors = useMemo(
    () => [...interpreter.errors, ...executeErrors],
    [interpreter.errors, executeErrors],
  );

  // Stable reference — a fresh object every render would make Monaco
  // re-apply its options on each parent render.
  const editorOptions = useMemo(
    () => (fontSize != null ? { fontSize } : undefined),
    [fontSize],
  );

  return (
    <div
      className={cn(
        "evmcrispr-root dark flex flex-col border-2 border-border bg-background text-foreground font-clearer rounded-(--radius) overflow-hidden",
        className,
      )}
    >
      <div
        style={height === "fill" ? undefined : { height }}
        className={cn(
          "relative min-h-0 overflow-hidden",
          height === "fill" ? "flex-1" : "shrink-0",
        )}
      >
        {mode === "view" ? (
          <Viewer
            script={script}
            fontSize={fontSize}
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
              options={editorOptions}
              background={editorBackground}
            />
          </Suspense>
        )}

        {!executeAction && (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-10 flex max-h-[85%] flex-col border-t-2 border-border bg-background transition-transform duration-300",
              drawerOpen ? "translate-y-0" : "translate-y-full",
            )}
            aria-hidden={!drawerOpen}
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-evm-gray-900/50 px-3 py-2">
              <span className="font-head text-sm text-foreground/70">
                {interpreter.isRunning ? "Simulating…" : "Simulation result"}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close simulation result"
                className="text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                tabIndex={drawerOpen ? 0 : -1}
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-2">
              {interpreter.isRunning ? (
                <p className="py-2 text-sm text-foreground/40">
                  Running the script against a read-only client…
                </p>
              ) : (
                <>
                  {interpreter.actions.length > 0 && (
                    <ActionsPreview actions={interpreter.actions} />
                  )}
                  {(interpreter.logs.length > 0 || errors.length > 0) && (
                    <Console logs={interpreter.logs} errors={errors} />
                  )}
                  {interpreter.actions.length === 0 &&
                    interpreter.logs.length === 0 &&
                    errors.length === 0 && (
                      <p className="py-2 text-sm text-foreground/40">
                        The script completed without producing transactions or
                        output.
                      </p>
                    )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-evm-gray-900/50">
        {/* Mirrors the RetroUI "default" button variant from @repo/ui:
            flat green shadow that collapses as the button travels on
            hover/press. */}
        <button
          type="button"
          onClick={run}
          disabled={interpreter.isRunning || script.trim().length === 0}
          className="px-4 py-1.5 bg-evm-green-300 text-evm-gray-900 font-head text-sm rounded-(--radius) border-2 border-border shadow-md hover:shadow active:shadow-none hover:translate-y-1 active:translate-y-2 active:translate-x-1 transition-all duration-200 disabled:opacity-40 hover:bg-evm-green-500 cursor-pointer disabled:cursor-default"
        >
          {interpreter.isRunning
            ? executeAction
              ? "Running…"
              : "Simulating…"
            : executeAction
              ? "Execute"
              : "Simulate"}
        </button>
      </div>

      {showConsole && executeAction && (
        <div className="border-t border-border/40 max-h-56 overflow-y-auto bg-evm-gray-900/30">
          <Console
            logs={interpreter.logs}
            errors={errors}
            placeholder="Console output will appear here during execution."
          />
        </div>
      )}
    </div>
  );
}

/**
 * Batteries-included embeddable EVMcrispr terminal: Monaco editor (lazy),
 * Shiki viewer and — without a wallet — a `Simulate` button that opens a
 * results drawer with a decoded preview of the transactions a script
 * resolves to, plus its console output.
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
