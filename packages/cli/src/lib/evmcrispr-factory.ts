import type { EvmlTag } from "@evmcrispr/core";
import { evml } from "@evmcrispr/core";
import type { Address, Transport } from "viem";
import { http } from "viem";
import { getDefaultChainId, getRpcUrl } from "./config.js";

/**
 * Build an `evml` tag configured for the CLI: the requested chain, its
 * RPC transport and the optional `--from` account. Logs are collected
 * into the returned `logs` array.
 */
export function createEvmlTag(options?: {
  chainId?: number;
  rpcUrl?: string;
  from?: Address;
}): { tag: EvmlTag; logs: string[] } {
  const chainId = options?.chainId ?? getDefaultChainId();
  const rpcUrl = options?.rpcUrl ?? getRpcUrl(chainId);
  const transports: Record<number, Transport> = { [chainId]: http(rpcUrl) };

  const logs: string[] = [];
  const tag = evml.with({
    account: options?.from,
    chainId,
    transports,
    onLog: (message) => {
      logs.push(message);
    },
  });

  return { tag, logs };
}
