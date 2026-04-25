import { useCallback } from "react";
import { useSearchParams } from "react-router";
import {
  terminalStoreActions,
  useTerminalStore,
  type ViewMode,
} from "../stores/terminal-store";
import { persistViewMode } from "../utils/view-mode";

/**
 * Read + mutate the current view mode while keeping the URL `?mode=` hint
 * in sync with the user's intent. A manual change — toggling the button
 * or tapping into the viewer to start editing — always wins over any
 * incoming URL hint, so future reloads obey the user's preference and
 * the URL stays clean for share links.
 */
export function useViewMode(): {
  viewMode: ViewMode;
  setViewMode: (next: ViewMode) => void;
  toggleViewMode: () => void;
} {
  const viewMode = useTerminalStore((s) => s.viewMode);
  const [searchParams, setSearchParams] = useSearchParams();

  const setViewMode = useCallback(
    (next: ViewMode) => {
      if (next === viewMode) return;
      terminalStoreActions("viewMode", next);
      persistViewMode(next);
      if (searchParams.has("mode")) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("mode");
        setSearchParams(nextParams, { replace: true });
      }
    },
    [viewMode, searchParams, setSearchParams],
  );

  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === "view" ? "edit" : "view");
  }, [viewMode, setViewMode]);

  return { viewMode, setViewMode, toggleViewMode };
}
