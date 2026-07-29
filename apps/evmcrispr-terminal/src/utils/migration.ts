import type { LegacyStoredScript } from "../types/index";
import {
  createScript,
  saveEditLog,
  setLastViewedScript,
} from "./local-storage";

const MIGRATION_DONE_KEY = "evmcrispr:migrated";

/**
 * One-time migration from the old slug-based `savedScripts` + zustand-persisted
 * `terminal-store` to the new UUID-based `evmcrispr:scripts` registry.
 *
 * Safe to call multiple times -- it's a no-op after the first successful run.
 */
export function migrateFromLegacyStorage() {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const legacyRaw = localStorage.getItem("savedScripts");
  const zustandRaw = localStorage.getItem("terminal-store");

  let lastCreatedId: string | null = null;

  if (legacyRaw) {
    try {
      const legacy: Record<string, LegacyStoredScript> = JSON.parse(legacyRaw);

      for (const entry of Object.values(legacy)) {
        if (!entry.title && !entry.script) continue;
        const id = createScript(entry.title ?? "", entry.script ?? "");
        if (entry.script) {
          saveEditLog(id, { base: entry.script, ops: [] });
        }
        lastCreatedId = id;
      }
    } catch {
      // Corrupted legacy data -- skip
    }
  }

  if (zustandRaw) {
    try {
      const parsed = JSON.parse(zustandRaw);
      const state = parsed?.state ?? parsed;
      const title = state?.title ?? "";
      const script = state?.script ?? "";

      if (script?.trim()) {
        const id = createScript(title, script);
        saveEditLog(id, { base: script, ops: [] });
        lastCreatedId = id;
      }
    } catch {
      // Corrupted zustand data -- skip
    }
  }

  if (lastCreatedId) {
    setLastViewedScript(lastCreatedId);
  }

  localStorage.setItem(MIGRATION_DONE_KEY, "1");
}
