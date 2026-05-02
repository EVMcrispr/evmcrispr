import type { Transport } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { gnosis, mainnet } from "viem/chains";

const transport = http("http://127.0.0.1:8545");

export function getPublicClient() {
  return createPublicClient({ chain: gnosis, transport });
}

/**
 * Build a transports map for the chains the tests touch.
 *
 * Gnosis is ALWAYS routed at the local anvil fork because that's where
 * `getWalletClients()` sends transactions. Routing it anywhere else —
 * e.g. through DRPC — causes `getTransactionCount(...)` reads to see
 * the real upstream chain state while writes land on anvil, which
 * desyncs nonce predictions (e.g. `aragonos:new-token`'s predicted
 * token address ends up at the upstream factory's nonce instead of
 * anvil's, so the follow-up `changeController` reverts).
 *
 * Mainnet is for cross-chain helpers (e.g. `@ens` resolving). It uses
 * DRPC when a key is present, otherwise falls through to anvil so
 * unit tests stay offline-runnable.
 */
export function getTransports(): Record<number, Transport> {
  const drpcKey = process.env.VITE_DRPC_API_KEY;
  return {
    [mainnet.id]: drpcKey
      ? http(`https://lb.drpc.live/ethereum/${drpcKey}`)
      : transport,
    [gnosis.id]: transport,
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
