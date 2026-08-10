import type { CompileCtx } from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { registryMap, requireAddress } from "./addresses";

/**
 * The registry an on-chain face should address.
 *
 * ENS lives on mainnet and sepolia; the plain faces read mainnet through
 * a dedicated client, which an expression cannot do — a staticcall runs
 * on whatever chain executes the batch. So a chain with its own registry
 * uses it, and anything else keeps the mainnet literal, matching what
 * `@addr!` already does.
 */
export async function onchainRegistry(ctx: CompileCtx): Promise<Address> {
  const chainId = await ctx.module.getChainId();
  return registryMap.get(chainId) ?? requireAddress(registryMap, 1, "ENS");
}

/** The same fallback for any other ENS address book. */
export async function onchainAddress(
  ctx: CompileCtx,
  map: Map<number, Address>,
  label: string,
): Promise<Address> {
  const chainId = await ctx.module.getChainId();
  return map.get(chainId) ?? requireAddress(map, 1, label);
}
