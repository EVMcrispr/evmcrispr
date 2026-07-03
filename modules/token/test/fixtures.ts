/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for state-reading tests.
 */

/** GNO token: ERC-1967 proxy with no admin slot (UUPS-style) + Ownable. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** Arbitrary address used as recipient / operator. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
