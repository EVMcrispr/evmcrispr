import { registeredChains } from "@evmcrispr/sdk";
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

import { anvilUrl, getEndpoint } from "../../../scripts/anvil-config";

/** Built per call: the port is chosen by the test runner and exported into
 *  the environment, so it is not known when this module is imported. */
const transport = () => http(anvilUrl());

/** The test anvil mines on demand: poll it for receipts far more often than
 *  Gnosis's block time (viem's default, 2.5s). Anvil >= 1.8 answers a send
 *  before the block is mined, so the first poll often misses. */
export const ANVIL_POLLING_MS = 100;

export function getPublicClient() {
  return createPublicClient({
    chain: gnosis,
    transport: transport(),
    pollingInterval: ANVIL_POLLING_MS,
  });
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
 * EVMCRISPR_RPC_URL_<id>, or DRPC when a key is present, otherwise fall
 * through to anvil so unit tests stay offline-runnable.
 */
export function getTransports(): Record<number, Transport> {
  const upstream = (chainId: number) => {
    const endpoint = getEndpoint(chainId);
    return endpoint ? http(endpoint) : transport();
  };

  const transports: Record<number, Transport> = {
    [mainnet.id]: upstream(mainnet.id),
    [optimism.id]: upstream(optimism.id),
    [polygon.id]: upstream(polygon.id),
    [base.id]: upstream(base.id),
    [arbitrum.id]: upstream(arbitrum.id),
    [gnosis.id]: transport(),
  };
  // Module-shipped chains (registered by `registerAllModules()`): their
  // declared RPC, overridable per chain with EVMCRISPR_RPC_URL_<id> — the
  // same knob the CLI honours — so a local devnet can stand in.
  for (const def of registeredChains()) {
    if (transports[def.id]) continue;
    transports[def.id] = http(
      process.env[`EVMCRISPR_RPC_URL_${def.id}`] ?? def.rpcUrl,
    );
  }
  return transports;
}

export function getWalletClients() {
  const mnemonic =
    "test test test test test test test test test test test junk";
  return Array.from({ length: 10 }, (_, i) =>
    createWalletClient({
      account: mnemonicToAccount(mnemonic, { addressIndex: i }),
      chain: gnosis,
      transport: transport(),
      pollingInterval: ANVIL_POLLING_MS,
    }),
  );
}
