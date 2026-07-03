/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for state-reading tests.
 */

/** GNO token: ERC-1967 proxy with no admin slot (UUPS-style) + Ownable. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";
export const GNO_IMPLEMENTATION = "0xf8D1677c8a0c961938bf2f9aDc3F3CFDA759A9d9";

/** Giveth TokenDistro: transparent ERC-1967 proxy + AccessControl. */
export const TOKEN_DISTRO = "0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1";
export const TOKEN_DISTRO_PROXY_ADMIN =
  "0x076C250700D210e6cf8A27D1EB1Fd754FB487986";

/** Arbitrary address used as new implementation. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
