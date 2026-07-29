import type { Module } from "@evmcrispr/sdk";

/**
 * Non-null while a sim:fork block is executing. Detected structurally
 * through the shared module list so bridges needs no dependency on
 * @evmcrispr/module-sim.
 */
export function activeSimMode(module: Module): string | null {
  const sim = module.context.modules.find((m) => m.name === "sim") as
    | (Module & { mode?: string | null })
    | undefined;
  return sim?.mode ?? null;
}

/**
 * Register a cross-chain relay handler with the sim module when a fork is
 * active, so the destination leg of a bridge gets auto-delivered when the
 * script switches chains. No-op outside simulations.
 */
export function registerSimRelayHandler(
  module: Module,
  handler: {
    id: string;
    sourceEvents: (srcChainId: number) => { topic: string; address?: string }[];
    parse: (log: any, ctx: any) => Promise<{ dstChainId: number } | null>;
    buildDelivery: (module: Module, log: any, ctx: any) => Promise<any[]>;
  },
): void {
  const sim = module.context.modules.find((m) => m.name === "sim") as
    | (Module & {
        mode?: string | null;
        registerRelayHandler?: (h: unknown) => void;
      })
    | undefined;
  if (!sim?.mode || typeof sim.registerRelayHandler !== "function") return;
  sim.registerRelayHandler(handler);
}

/** Admin RPC prefix for the active sim mode (e.g. "anvil_", "tenderly_"). */
export function simRpcPrefix(module: Module): string {
  const mode = activeSimMode(module) ?? "anvil";
  return mode === "tenderly-multichain" ? "tenderly" : mode;
}
