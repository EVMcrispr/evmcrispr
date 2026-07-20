import type { Address } from "viem";

// All addresses verified via eth_call (2026-07-20): DonationHandler proxies
// answer owner() with the same Giveth multisig on every chain, GIV tokens
// answer symbol() with "GIV", TokenDistros answer token() with the chain's
// GIV address, and GIVpower contracts answer name() with "GIVpower". Sourced
// from Giveth/giveth-dapps-v2 production config and Giveth/giveth-v6-fe.

/** Giveth DonationHandler proxy per chain (single + batch donations). */
export const DONATION_HANDLER: Record<number, Address> = {
  1: "0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676",
  10: "0x8D685A56C51Cf54685d3dB0Ea50748D3A2c2e0dC",
  100: "0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676",
  137: "0x4102E15f4621Fc45fCe8E07442A702BD49fcea4b",
  8453: "0x7a5D2A00a25b95fd8739bc52Cd79f8F971C37Ca1",
  42161: "0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676",
  42220: "0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676",
};

/** GIV token per chain. */
export const GIV_TOKEN: Record<number, Address> = {
  1: "0x900dB999074d9277c5DA2A43F252D74366230DA0",
  10: "0x528CDc92eAB044E1E39FE43B9514bfdAB4412B98",
  100: "0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75",
  137: "0xc7B1807822160a8C5b6c9EaF5C584aAD0972deeC",
  1101: "0xddAFB91475bBf6210a151FA911AC8fdA7dE46Ec2",
};

/** TokenDistro (GIVstream) per chain. */
export const TOKEN_DISTRO: Record<number, Address> = {
  1: "0x87dE995F6744B75bBe0255A973081142aDb61f4d",
  10: "0xE3Ac7b3e6B4065f4765d76fDC215606483BF3bD1",
  100: "0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1",
  1101: "0x4fB9B10ECDe1b048DBC79aBEAB3793edc93a0d54",
};

/** A GIVpower deployment. On Gnosis GIV is staked by wrapping it into gGIV
 *  through the GIVgarden token manager, which auto-stakes into the lm via a
 *  hook; elsewhere GIV is staked directly on the lm (UnipoolGIVpower). */
export interface GivpowerDeployment {
  kind: "garden" | "unipool";
  /** GIVpower liquidity-mining contract: lock/unlock/rounds/rewards. */
  lm: Address;
  /** Gnosis only: GIVgarden HookedTokenManager (wrap/unwrap). */
  garden?: Address;
  /** Gnosis only: gGIV token, balance = raw staked GIV. */
  gGiv?: Address;
}

export const GIVPOWER: Record<number, GivpowerDeployment> = {
  10: { kind: "unipool", lm: "0x301C739CF6bfb6B47A74878BdEB13f92F13Ae5E7" },
  100: {
    kind: "garden",
    lm: "0xD93d3bDBa18ebcB3317a57119ea44ed2Cf41C2F2",
    garden: "0x24F2d06446AF8D6E89fEbC205e7936a602a87b60",
    gGiv: "0xfFBAbEb49be77E5254333d5fdfF72920B989425f",
  },
  1101: { kind: "unipool", lm: "0xc790f82bF6F8709aa4A56dc11afaD7aF7C2a9867" },
};

export const GIVETH_GRAPHQL_URL = "https://mainnet.serve.giveth.io/graphql";
export const GIVETH_AUTH_URL = "https://auth.giveth.io/v1";
export const CORS_PROXY_PREFIX = "https://api.evmcrispr.com/cors-proxy/";

/** The Giveth project itself — recipient of `giveth:donate --tip` (verified
 *  to have a recipient address on every DONATION_HANDLER chain, 2026-07-20). */
export const GIVETH_TIP_SLUG = "the-giveth-community-of-makers";
