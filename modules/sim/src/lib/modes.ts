import type { SimMode } from "..";

/**
 * Admin RPC method prefix for a simulation mode. tenderly-multichain talks
 * to the same per-network admin RPCs as plain tenderly, so it shares the
 * `tenderly_*` cheatcode prefix.
 */
export function rpcPrefix(
  mode: SimMode,
): "anvil" | "hardhat" | "tenderly" | "ethereumjs" | "revm" {
  return mode === "tenderly-multichain" ? "tenderly" : mode;
}
