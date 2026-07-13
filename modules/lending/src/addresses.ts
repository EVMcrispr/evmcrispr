import type { Address } from "viem";

// All addresses below were verified via eth_call (2026-07): each provider
// answers getPool() with the market's live Pool. Only the
// PoolAddressesProvider is pinned — Aave governance has swapped the Pool
// implementation, Oracle and DataProvider across 3.x upgrades, so the
// adapter resolves those through the provider at runtime.

/** Aave v3 PoolAddressesProvider per chain (the market's stable anchor). */
export const AAVE_V3_ADDRESSES_PROVIDER: Record<number, Address> = {
  1: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
  10: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  100: "0x36616cf17557639614c1cdDb356b1B83fc0B2132",
  137: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  8453: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  42161: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
};

/** SparkLend (Aave v3 fork) PoolAddressesProvider per chain. */
export const SPARK_ADDRESSES_PROVIDER: Record<number, Address> = {
  1: "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE",
  100: "0xA98DaCB3fC964A6A0d2ce3B77294241585EAbA6d",
};

/** A Compound v3 (Comet) market: one contract per base asset per chain.
 *  The base token address is read from the comet at runtime; baseSymbol is
 *  only for error messages and docs. */
export interface CometDeployment {
  comet: Address;
  baseSymbol: string;
}

/** Compound v3 comets per chain, most prominent market first (the order
 *  breaks ties when a token is collateral on several markets). */
export const COMPOUND_V3: Record<number, CometDeployment[]> = {
  1: [
    { comet: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", baseSymbol: "USDC" },
    { comet: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", baseSymbol: "WETH" },
    { comet: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840", baseSymbol: "USDT" },
  ],
  10: [
    { comet: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB", baseSymbol: "USDC" },
  ],
  137: [
    { comet: "0xF25212E676D1F7F89Cd72fFEe66158f541246445", baseSymbol: "USDC" },
  ],
  8453: [
    { comet: "0xb125E6687d4313864e53df431d5425969c15Eb2F", baseSymbol: "USDC" },
    { comet: "0x46e6b214b524310239732D51387075E0e70970bf", baseSymbol: "WETH" },
  ],
  42161: [
    { comet: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", baseSymbol: "USDC" },
  ],
};
