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
/**
 * Centrifuge Janus Henderson Anemoy Treasury Fund (JTRSY) on Ethereum
 * mainnet: a live ERC-7540 vault, asynchronous on both deposit and redeem.
 */
export const CENTRIFUGE_JTRSY_VAULT: Address =
  "0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A";
/** The JTRSY vault's external ERC-7575 share token. */
export const JTRSY_SHARE: Address =
  "0x8c213ee79581Ff4984583C6a801e5263418C4b86";
/** USDC on Ethereum mainnet: the JTRSY vault's underlying asset(). */
export const USDC_MAINNET: Address =
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
