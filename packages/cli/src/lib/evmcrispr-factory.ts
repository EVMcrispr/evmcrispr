import { EVMcrispr } from "@evmcrispr/core";
import type { Address, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as chains from "viem/chains";
import { getDefaultChainId, getRpcUrl } from "./config.js";

function getChain(chainId: number) {
  return Object.values(chains).find(
    (c): c is (typeof chains)[keyof typeof chains] =>
      typeof c === "object" && c !== null && "id" in c && c.id === chainId,
  );
}

export function createEVMcrisprInstance(options?: {
  chainId?: number;
  rpcUrl?: string;
  from?: Address;
}): { evm: EVMcrispr; logs: string[] } {
  const chainId = options?.chainId ?? getDefaultChainId();
  const rpcUrl = options?.rpcUrl ?? getRpcUrl(chainId);
  const chain = getChain(chainId);

  const transport = http(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem version mismatch between workspace packages
  const client = createPublicClient({ chain, transport }) as any;

  const transports: Record<number, Transport> = { [chainId]: transport };

  const evm = new EVMcrispr(client, options?.from, transports);

  const logs: string[] = [];
  evm.registerLogListener((message: string) => {
    logs.push(message);
  });

  return { evm, logs };
}
