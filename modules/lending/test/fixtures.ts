/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for lending tests.
 */

/** WXDAI: the wrapped native token on Gnosis. Listed on Aave v3 and
 *  collateral-enabled at the pinned fork block. */
export const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

/** GNO token, also listed on the Aave v3 Gnosis market. */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** Aave v3 Gnosis market, resolved through the pinned addresses provider
 *  (0x36616cf17557639614c1cdDb356b1B83fc0B2132) at the fork block. */
export const AAVE_POOL = "0xb50201558B00496A145fE76f7424749556E326D8";
export const A_WXDAI = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
export const VDEBT_WXDAI = "0x281963D7471eCdC3A2Bd4503e24e89691cfe420D";

/** SparkLend Gnosis market (Aave v3 fork), resolved through its provider
 *  (0xA98DaCB3fC964A6A0d2ce3B77294241585EAbA6d). WXDAI is listed there at
 *  the fork block too. */
export const SPARK_POOL = "0x2Dae5307c5E3FD1CF5A72Cb6F698f915860607e0";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Arbitrary address with no code and no Aave position at the fork block. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
