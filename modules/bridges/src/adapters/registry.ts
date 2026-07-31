import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { Address } from "viem";
import across from "./across";
import ccip from "./ccip";
import cctp from "./cctp";
import layerzero from "./layerzero";
import native from "./native";
import type { BridgeAdapter } from "./types";

/** All adapters, keyed by lowercased name (--using is case-insensitive). */
export const ADAPTERS: Record<string, BridgeAdapter> = Object.fromEntries(
  [cctp, across, native, layerzero, ccip].map((a) => [a.name.toLowerCase(), a]),
);

/**
 * Preference order for implicit selection: canonical USDC first, then the
 * intent-based liquidity bridge, then the chain's own canonical bridge.
 *
 * LayerZero and CCIP are deliberately excluded: whether a token is an OFT
 * or has a CCIP token pool can't be known statically, so they must be
 * requested with --using.
 */
export const DEFAULT_ORDER: BridgeAdapter[] = [cctp, across, native];

/**
 * Pick the adapter for a bridge, quote or claim: the --using value when
 * given (validated against the lane), otherwise the first adapter in
 * DEFAULT_ORDER that serves it.
 */
export async function resolveAdapter(
  _module: Module,
  name: string | undefined,
  route: { srcChainId: number; dstChainId: number; token?: Address },
): Promise<BridgeAdapter> {
  const { srcChainId, dstChainId, token } = route;

  if (name !== undefined) {
    const adapter = ADAPTERS[name.toLowerCase()];
    if (!adapter) {
      const known = Object.values(ADAPTERS)
        .map((a) => a.name)
        .join(", ");
      throw new ErrorNotFound(
        `unknown bridge adapter "${name}" (known: ${known})`,
      );
    }
    if (!adapter.supports(srcChainId, dstChainId, token)) {
      throw new ErrorException(
        `${adapter.name} doesn't bridge ${
          token ? `${token} ` : ""
        }from ${chainLabel(srcChainId)} to ${chainLabel(dstChainId)}`,
      );
    }
    return adapter;
  }

  for (const adapter of DEFAULT_ORDER) {
    if (adapter.supports(srcChainId, dstChainId, token)) return adapter;
  }

  throw new ErrorNotFound(
    `no bridge adapter available from ${chainLabel(srcChainId)} to ${chainLabel(dstChainId)}` +
      `${token ? ` for ${token}` : ""} — try --using LayerZero or --using CCIP`,
  );
}
