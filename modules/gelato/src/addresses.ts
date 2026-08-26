import type { Address } from "viem";

// Gelato deploys Automate and OpsProxyFactory behind the same proxy address
// on every supported chain (github.com/gelatodigital/automate, deployments/).
// The chains listed here were each verified with eth_getCode on 2026-08-26;
// avalanche is left out because its OpsProxyFactory slot has no code.

/** Automate (task registry) — same address on every listed chain. */
export const AUTOMATE_ADDRESS: Address =
  "0x2A6C106ae13B558BB9E2Ec64Bd2f1f7BEFF3A5E0";

/** OpsProxyFactory — deploys/predicts each account's dedicated msg.sender. */
export const OPS_PROXY_FACTORY_ADDRESS: Address =
  "0x44bde1bccdD06119262f1fE441FBe7341EaaC185";

/** Chains where both Automate and OpsProxyFactory are live. */
export const AUTOMATE_CHAINS: readonly number[] = [
  1, // ethereum
  10, // optimism
  56, // bsc
  100, // gnosis
  137, // polygon
  8453, // base
  42161, // arbitrum
  59144, // linea
  81457, // blast
  // Testnets
  11155111, // sepolia
  84532, // base-sepolia
  421614, // arbitrum-sepolia
  11155420, // optimism-sepolia
];

/**
 * Gas Tank (Gelato 1Balance): the single multi-chain balance every Gelato
 * service bills against. Deposits are USDC on Polygon only. EIP-1967 proxy
 * verified on polygonscan ("Gelato: 1 Balance", impl 0x2D6012A3…8BB01).
 */
export const ONE_BALANCE = {
  chainId: 137,
  address: "0x7506C12a824d73D9b08564d5Afc22c949434755e" as Address,
  /** Native USDC on Polygon — the only deposit token 1Balance accepts. */
  usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address,
} as const;

/** Anonymous Web3 Function upload/fetch endpoint used by `w3f deploy`. */
export const W3F_UPLOAD_URL =
  "https://api.gelato.digital/automate/users/users/web3-function";

export const CORS_PROXY_PREFIX = "https://api.evmcrispr.com/cors-proxy/";
