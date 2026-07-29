import type { Transport } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  arbitrum,
  base,
  gnosis,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";

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
 * Mainnet and the L2s are for cross-chain helpers (`@ens` resolving,
 * `bridges` destination-chain reads, multi-fork `sim` runs). They use
 * DRPC when a key is present, otherwise fall through to anvil so unit
 * tests stay offline-runnable.
 */
export function getTransports(): Record<number, Transport> {
  const drpcKey = process.env.VITE_DRPC_API_KEY;
  const drpc = (network: string) =>
    drpcKey ? http(`https://lb.drpc.live/${network}/${drpcKey}`) : transport;

  return {
    [mainnet.id]: drpc("ethereum"),
    [optimism.id]: drpc("optimism"),
    [polygon.id]: drpc("polygon"),
    [base.id]: drpc("base"),
    [arbitrum.id]: drpc("arbitrum"),
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
