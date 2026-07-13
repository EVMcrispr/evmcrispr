import type { Module } from "@evmcrispr/sdk";

/**
 * Non-null while a sim:fork block is executing. Detected structurally
 * through the shared module list so lending needs no dependency on
 * @evmcrispr/module-sim.
 */
export function activeSimMode(module: Module): string | null {
  const sim = module.context.modules.find((m) => m.name === "sim") as
    | (Module & { mode?: string | null })
    | undefined;
  return sim?.mode ?? null;
}
