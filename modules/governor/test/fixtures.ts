/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for state-reading tests.
 */

/** GNO token: ERC-1967 proxy with no admin slot (UUPS-style) + Ownable. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** Giveth TokenDistro: transparent ERC-1967 proxy + AccessControl. */
export const TOKEN_DISTRO = "0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1";

/** Arbitrary address used as recipient / grantee. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
