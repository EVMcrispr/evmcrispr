import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";

const transport = http("http://127.0.0.1:8545");

export function getPublicClient() {
  return createPublicClient({ chain: gnosis, transport });
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
