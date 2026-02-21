import { createPublicClient, http, type PublicClient } from "viem";
import { arbitrum, gnosis, mainnet, optimism, polygon } from "viem/chains";

const ANVIL_URL = "http://127.0.0.1:8545";

const GNOSIS_FORK_BLOCK_NUMBER = 44798478;

const chainIdToRpcUrl = {
  1: "ethereum",
  10: "optimism",
  100: "gnosis",
  137: "polygon",
  42161: "arbitrum",
};

const viemChains = {
  1: mainnet,
  10: optimism,
  100: gnosis,
  137: polygon,
  42161: arbitrum,
};

const rpcUrl = (chainId: keyof typeof chainIdToRpcUrl) =>
  `https://lb.drpc.live/${chainIdToRpcUrl[chainId]}/${process.env.VITE_DRPC_API_KEY}`;

export async function resetAnvil(
  chainId: keyof typeof chainIdToRpcUrl = 100,
  blockNumber?: number,
): Promise<PublicClient> {
  const forkBlock =
    blockNumber ?? (chainId === 100 ? GNOSIS_FORK_BLOCK_NUMBER : undefined);
  await fetch(ANVIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "anvil_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: rpcUrl(chainId),
            ...(forkBlock != null && { blockNumber: forkBlock }),
          },
        },
      ],
      id: 1,
    }),
  });
  return createPublicClient({
    chain: viemChains[chainId],
    transport: http(ANVIL_URL),
  }) as PublicClient;
}
