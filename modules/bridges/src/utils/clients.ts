import type { Module } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { createPublicClient } from "viem";

const cache = new WeakMap<Module, Map<number, PublicClient>>();

/**
 * Public client for an arbitrary chain, built from the interpreter's
 * configured transports. Used for destination-chain reads (status, claims)
 * without disturbing the active client.
 */
export async function clientFor(
  module: Module,
  chainId: number,
): Promise<PublicClient> {
  if ((await module.getChainId()) === chainId) {
    return module.getClient();
  }
  let clients = cache.get(module);
  if (!clients) {
    clients = new Map();
    cache.set(module, clients);
  }
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({
      transport: module.getTransport(chainId),
    }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}
