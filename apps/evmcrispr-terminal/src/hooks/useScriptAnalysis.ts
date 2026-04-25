import { EVMcrispr, type ParseDiagnostic } from "@evmcrispr/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { transports } from "../config/wagmi";
import { useDebounce } from "./useDebounce";

const SCRIPT_DEBOUNCE_MS = 300;

type Position = { line: number; col: number };

/**
 * Read-only sibling of `useEditorState` for the viewer page. Maintains an
 * `EVMcrispr` instance bound to the active public client and prewarms it
 * whenever the (debounced) script changes — same pattern Monaco uses, so
 * hover lookups for `@helper` and `$variable` tokens progressively
 * upgrade from "name + signature" to "name + signature + resolved value
 * card" once the prewalk is done populating the helper / `set` cache.
 *
 * Important: `getHoverInfo` is fired-and-forwarded straight to
 * `evm.getHoverInfo` (not awaited on the prewarm promise). That mirrors
 * the editor's hover provider and means a slow / hung RPC inside
 * `prewarm` (e.g. an unreachable `switch <chain>` followed by `load`)
 * cannot freeze every hover. The first hover may show the basic info
 * card; once prewarm finishes its on-instance writes (`#scriptBindings`,
 * `#variableHistory`), subsequent hovers automatically render the rich
 * card without any extra plumbing.
 *
 * Returns:
 * - `evm`: shared instance for `getHoverInfo` calls
 * - `getHoverInfo(position)`: thin pass-through to `evm.getHoverInfo`
 * - `diagnostics`: parse-time errors (re-computed on debounced changes)
 */
export function useScriptAnalysis(script: string) {
  const client = usePublicClient();

  const evm = useMemo(
    () => new EVMcrispr(client, undefined, transports),
    [client],
  );

  const debouncedScript = useDebounce(script, SCRIPT_DEBOUNCE_MS);

  const [diagnostics, setDiagnostics] = useState<ParseDiagnostic[]>([]);

  useEffect(() => {
    setDiagnostics(evm.getDiagnostics(debouncedScript));
    // Fire-and-forget: prewarm writes to instance state, which
    // `evm.getHoverInfo` reads at call time. Errors are swallowed
    // inside `prewarm`, so we never need to handle them here.
    void evm.prewarm(debouncedScript);
  }, [evm, debouncedScript]);

  const getHoverInfo = useCallback(
    (position: Position) => evm.getHoverInfo(debouncedScript, position),
    [evm, debouncedScript],
  );

  return {
    evm,
    debouncedScript,
    diagnostics,
    getHoverInfo,
  };
}
