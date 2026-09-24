import type { Address } from "viem";

/** Creation support is deliberately separate from deployment/reference support.
 * Removing an entry from CREATION_CHAINS must never strand an existing order. */
export const TWAP_NETWORKS: Record<
  number,
  {
    slug: string;
    usdc: Address;
    minimumUsdc: bigint;
    /** About six hours of blocks: how far back an order hash is looked up
     *  on-chain when CoW's indexer does not (yet) list it. */
    recentBlocks: bigint;
  }
> = {
  1: {
    slug: "mainnet",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    minimumUsdc: 1000_000000n,
    recentBlocks: 1_800n,
  },
  100: {
    slug: "xdai",
    usdc: "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0",
    minimumUsdc: 1_000000n,
    recentBlocks: 4_320n,
  },
  137: {
    slug: "polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    minimumUsdc: 1_000000n,
    recentBlocks: 10_800n,
  },
  8453: {
    slug: "base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    minimumUsdc: 1_000000n,
    recentBlocks: 10_800n,
  },
  42161: {
    slug: "arbitrum_one",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    minimumUsdc: 1_000000n,
    recentBlocks: 86_400n,
  },
};
export const TWAP_CREATION_CHAINS = new Set([1, 100, 137, 8453, 42161]);
export const TWAP_DEPLOYMENT_CHAINS = new Set(
  Object.keys(TWAP_NETWORKS).map(Number),
);
export const MIN_PART_INTERVAL = 300n;
export const PROGRAMMATIC_API = "https://programmatic-orders.cow.fi/graphql";

/** Revisions reviewed for these policies, not a runtime dependency on main. */
export const TWAP_UPSTREAM = {
  frontend: "ee249c2bf3a427765c602e83004f08a291c8d92f",
  programmaticApi: "caaa9a33f72f7b134a44763747874292e1494cde",
  sdk: "070661fcc3711c2535d54f8b23bb31ea29125592",
  settlement: "c07a93e3596194c5e3cf331c755a3f9f0e4a17d8",
};
