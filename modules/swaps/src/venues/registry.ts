import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import { activeSimMode } from "../utils/sim";
import balancer from "./balancer";
import cowswap from "./cowswap";
import delora from "./delora";
import honeyswap from "./honeyswap";
import sushiswap from "./sushiswap";
import type { VenueAdapter } from "./types";
import uniswapV2 from "./uniswap-v2";
import uniswapV3 from "./uniswap-v3";
import uniswapV4 from "./uniswap-v4";

/** All venues, keyed by lowercased name (--using is case-insensitive). */
export const VENUES: Record<string, VenueAdapter> = Object.fromEntries(
  [
    delora,
    uniswapV4,
    uniswapV3,
    uniswapV2,
    honeyswap,
    sushiswap,
    balancer,
    cowswap,
  ].map((v) => [v.name.toLowerCase(), v]),
);

/** Preference order for implicit venue selection: the Delora aggregator
 *  where it serves the chain, then on-chain venues, then other APIs.
 *  Intent venues (CoWSwap) are deliberately excluded: they sign and post
 *  orders, so the user must opt in with --using. */
export const DEFAULT_ORDER: VenueAdapter[] = [
  delora,
  uniswapV4,
  uniswapV3,
  uniswapV2,
  honeyswap,
  sushiswap,
  balancer,
];

const ONCHAIN_SUGGESTION =
  "use an on-chain venue (UniswapV3, UniswapV2, Honeyswap, SushiSwap)";

/**
 * Pick the venue for a swap or quote: the --using value when given
 * (validated against the current chain, sim mode, and exact-out support),
 * otherwise the first venue in DEFAULT_ORDER that fits.
 */
export async function resolveVenue(
  module: Module,
  name: string | undefined,
  { exactOut = false }: { exactOut?: boolean } = {},
): Promise<VenueAdapter> {
  const chainId = await module.getChainId();
  const sim = activeSimMode(module);

  if (name !== undefined) {
    const venue = VENUES[name.toLowerCase()];
    if (!venue) {
      const known = Object.values(VENUES)
        .map((v) => v.name)
        .join(", ");
      throw new ErrorNotFound(`unknown swap venue "${name}" (known: ${known})`);
    }
    if (!venue.supports(chainId)) {
      throw new ErrorException(
        `${venue.name} is not available on ${chainLabel(chainId)}`,
      );
    }
    if (sim && venue.kind !== "onchain") {
      throw new ErrorException(
        `${venue.name} depends on off-chain APIs and is not deterministic inside a simulation; ${ONCHAIN_SUGGESTION}`,
      );
    }
    if (exactOut && !venue.supportsExactOut) {
      throw new ErrorException(
        `${venue.name} does not support exact-output swaps`,
      );
    }
    return venue;
  }

  for (const venue of DEFAULT_ORDER) {
    if (!venue.supports(chainId)) continue;
    if (sim && venue.kind !== "onchain") continue;
    if (exactOut && !venue.supportsExactOut) continue;
    return venue;
  }
  throw new ErrorNotFound(`no swap venue available on ${chainLabel(chainId)}`);
}
