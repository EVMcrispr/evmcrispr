import type { Address } from "viem";

/** sDAI on Gnosis: ERC-4626 vault over WXDAI, live at the pinned fork block. */
export const SDAI: Address = "0xaf204776c7245bF4147c2612BF6e5972Ee483701";
/** WXDAI: the sDAI vault's underlying asset(). */
export const WXDAI: Address = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";
/** An address with no contract code — never a vault. */
export const SOME_ADDRESS: Address =
  "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
/** Steakhouse USDC MetaMorpho vault on Ethereum mainnet (docCases only). */
export const STEAKHOUSE_USDC: Address =
  "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
