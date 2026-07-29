/**
 * Well-known contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * used as fixtures for state-reading tests.
 */

/** GNO token: ERC-1967 proxy with no admin slot (UUPS-style) + Ownable.
 *  Supports EIP-2612 permit, exposing version() but not eip712Domain(). */
export const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";

/** sDAI: ERC-4626 vault token exposing eip712Domain() (EIP-5267). */
export const SDAI = "0xaf204776c7245bF4147c2612BF6e5972Ee483701";

/** WXDAI: wrapped native token without EIP-2612 support. */
export const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

/** Arbitrary address used as recipient / operator. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

/** Second arbitrary address for multi-recipient tests. */
export const OTHER_ADDRESS = "0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6";
