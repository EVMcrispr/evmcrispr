import type { Transport } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { gnosis, mainnet } from "viem/chains";

const transport = http("http://127.0.0.1:8545");

export function getPublicClient() {
  return createPublicClient({ chain: gnosis, transport });
}

/**
 * Build a transports map for cross-chain helpers (e.g. @ens resolving on mainnet).
 * Uses the DRPC API key from the environment when available.
 */
export function getTransports(): Record<number, Transport> {
  const drpcKey = process.env.VITE_DRPC_API_KEY;
  if (!drpcKey) return {};
  return {
    [mainnet.id]: http(`https://lb.drpc.live/ethereum/${drpcKey}`),
  };
}

export function getWalletClients() {
  const mnemonic =
    "test test test test test test test test test test test junk";
  return Array.from({ length: 10 }, (_, i) =>
    createWalletClient({
      account: mnemonicToAccount(mnemonic, { addressIndex: i }),
      chain: gnosis,
      transport,
    }),
  );
}
