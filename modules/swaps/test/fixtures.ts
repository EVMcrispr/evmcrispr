/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for swap tests.
 */

/** GNO token. Paired with WXDAI on both Honeyswap and SushiSwap at the
 *  pinned fork block, with healthy reserves. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** WXDAI: the wrapped native token on Gnosis. */
export const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const HONEYSWAP_ROUTER = "0x1C232F01118CB8B424793ae03F870aa7D0ac7f77";
export const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

/** Arbitrary addresses (no token contracts) used as recipients or to force
 *  liquidity-path failures. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
export const OTHER_ADDRESS = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
