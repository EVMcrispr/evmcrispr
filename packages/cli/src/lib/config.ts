import { registeredChain } from "@evmcrispr/core";

const DRPC_API_KEY = process.env.VITE_DRPC_API_KEY;

const DEFAULT_CHAIN_ID = Number(process.env.EVMCRISPR_DEFAULT_CHAIN_ID) || 1;

/** DRPC chain ID → slug mapping (mirrors terminal app's wagmi.ts) */
const DRPC_SLUGS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  100: "gnosis",
  137: "polygon",
  250: "fantom",
  324: "zksync",
  8453: "base",
  42161: "arbitrum",
  42170: "arbitrum-nova",
  43114: "avalanche",
  59144: "linea",
  534352: "scroll",
  5000: "mantle",
  1313161554: "aurora",
  1101: "polygon-zkevm",
  8217: "klaytn",
  42220: "celo",
  1284: "moonbeam",
  1285: "moonriver",
  288: "boba-eth",
  40: "telos",
  108: "viction",
  1111: "wemix",
  480: "worldchain",
  7777777: "zora",
  // Testnets
  11155111: "sepolia",
  80002: "polygon-amoy",
  11155420: "optimism-sepolia",
  421614: "arbitrum-sepolia",
  84532: "base-sepolia",
};

function drpcUrl(slug: string): string {
  return `https://lb.drpc.live/${slug}/${DRPC_API_KEY}`;
}

export function getRpcUrl(chainId?: number): string {
  const id = chainId ?? DEFAULT_CHAIN_ID;

  // Per-chain override
  const envOverride = process.env[`EVMCRISPR_RPC_URL_${id}`];
  if (envOverride) return envOverride;

  // Global override
  if (process.env.EVMCRISPR_RPC_URL) return process.env.EVMCRISPR_RPC_URL;

  // DRPC
  const slug = DRPC_SLUGS[id];
  if (slug && DRPC_API_KEY) return drpcUrl(slug);

  // A chain some module ships, with its own RPC (registered by
  // registerAllModules(), which every command runs first).
  const declared = registeredChain(id);
  if (declared) return declared.rpcUrl;

  throw new Error(
    `No RPC URL configured for chain ${id}. Set VITE_DRPC_API_KEY, EVMCRISPR_RPC_URL, or EVMCRISPR_RPC_URL_${id}.`,
  );
}

export function getDefaultChainId(): number {
  return DEFAULT_CHAIN_ID;
}
