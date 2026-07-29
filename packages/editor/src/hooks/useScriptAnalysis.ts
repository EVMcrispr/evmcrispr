import type { ParseDiagnostic } from "@evmcrispr/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEvmlTag } from "../context/EvmcrisprProvider";
import { useDebounce } from "./useDebounce";

const SCRIPT_DEBOUNCE_MS = 300;

type Position = { line: number; col: number };

/**
 * Read-only analysis session for the viewer. Maintains an `EvmlWorkspace`
 * bound to the nearest provider's tag and prewarms it whenever the
 * (debounced) script changes — same pattern the Monaco editor uses, so
 * hover lookups for `@helper` and `$variable` tokens progressively
 * upgrade from "name + signature" to "name + signature + resolved value
 * card" once the prewalk is done populating the helper / `set` cache.
 *
 * Important: `getHoverInfo` is fired-and-forwarded straight to
 * `evm.getHoverInfo` (not awaited on the prewarm promise), so a slow /
 * hung RPC inside `prewarm` cannot freeze every hover.
 */
export function useScriptAnalysis(script: string) {
  const tag = useEvmlTag();
  const evm = useMemo(() => tag.workspace(), [tag]);

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
