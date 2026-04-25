import type { ViewMode } from "../stores/terminal-store";

const VIEW_MODE_KEY = "evmcrispr:viewMode";
const SMALL_SCREEN_BREAKPOINT = 768;

function readUrlMode(): ViewMode | null {
  if (typeof window === "undefined") return null;
  const query = window.location.hash.split("?")[1];
  if (!query) return null;
  const value = new URLSearchParams(query).get("mode");
  if (value === "view" || value === "edit") return value;
  return null;
}

function readStoredMode(): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(VIEW_MODE_KEY);
    if (value === "view" || value === "edit") return value;
  } catch {
    // localStorage unavailable — fall through
  }
  return null;
}

function defaultModeForViewport(): ViewMode {
  if (typeof window === "undefined") return "edit";
  return window.innerWidth < SMALL_SCREEN_BREAKPOINT ? "view" : "edit";
}

/**
 * URL `?mode=` param > localStorage preference > viewport-based default.
 *
 * Called once when the terminal store initialises so the very first paint
 * already shows the right surface (no editor flash on mobile).
 */
export function resolveInitialViewMode(): ViewMode {
  return readUrlMode() ?? readStoredMode() ?? defaultModeForViewport();
}

export function persistViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
