import type { Module } from "../Module";
import type { OffchainOverlay } from "../types/modules";

/** Map-backed `OffchainOverlay`; one per interpreter run. */
export function createOffchainOverlay(): OffchainOverlay {
  const entries = new Map<string, unknown>();
  return {
    get<T>(key: string) {
      return entries.get(key) as T | undefined;
    },
    set(key, value) {
      entries.set(key, value);
    },
    update<T>(key: string, fn: (prev: T | undefined) => T) {
      const next = fn(entries.get(key) as T | undefined);
      entries.set(key, next);
      return next;
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

/**
 * Read an off-chain value through the simulation overlay: the recorded
 * value when a command in the enclosing `sim:fork` wrote one, the fetcher's
 * result otherwise. Wrap a module's API-client reads with this so simulated
 * writes shadow the network.
 */
export async function overlaid<T>(
  module: Module,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = module.context.offchain.get<T>(key);
  return hit === undefined ? fetcher() : hit;
}
