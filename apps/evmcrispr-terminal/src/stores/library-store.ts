import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScriptMeta } from "../types/index";

type LibraryState = {
  scripts: ScriptMeta[];
  addScript: (meta: ScriptMeta) => void;
  updateScript: (
    id: string,
    patch: Partial<Pick<ScriptMeta, "title" | "updatedAt">>,
  ) => void;
  removeScript: (id: string) => void;
  hydrateFromRegistry: (scripts: ScriptMeta[]) => void;
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      scripts: [],
      addScript: (meta) => set((s) => ({ scripts: [meta, ...s.scripts] })),
      updateScript: (id, patch) =>
        set((s) => ({
          scripts: s.scripts.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeScript: (id) =>
        set((s) => ({ scripts: s.scripts.filter((m) => m.id !== id) })),
      hydrateFromRegistry: (scripts) => {
        if (get().scripts.length === 0 && scripts.length > 0) {
          set({ scripts });
        }
      },
    }),
    { name: "evmcrispr:library" },
  ),
);
