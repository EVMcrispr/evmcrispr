import type { Hex, PublicClient } from "viem";
import { createPublicClient } from "viem";

import { ErrorException } from "../errors";
import type { Module } from "../Module";
import { viemChainById } from "./address-info";

const cache = new WeakMap<Module, Map<number, PublicClient>>();

/**
 * Public client for an arbitrary chain, built from the interpreter's
 * configured transports. Used for foreign-chain reads (bridge status,
 * tx introspection) without disturbing the active client.
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
      // Attach the viem chain when it's known: features like multicall
      // aggregation need `chain.contracts.multicall3` to be present.
      chain: viemChainById(chainId),
      transport: module.getTransport(chainId),
    }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}

/**
 * Validate a transaction-hash argument. `description` names the argument
 * in the error, e.g. `"<transferId> must be the source-chain transaction
 * hash of the bridge"`.
 */
export function assertTxHash(
  value: string,
  description = "<hash> must be a transaction hash",
): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ErrorException(
      `${description} (0x + 64 hex chars), got ${value}`,
    );
  }
  return value as Hex;
}
