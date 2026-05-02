import { EVMcrispr } from "@evmcrispr/core";
import type { Address, Transport } from "viem";
import { http } from "viem";
import { mainnet } from "viem/chains";
import { getDefaultChainId, getRpcUrl } from "./config.js";

export async function createEVMcrisprInstance(options?: {
  chainId?: number;
  rpcUrl?: string;
  from?: Address;
}): Promise<{ evm: EVMcrispr; logs: string[] }> {
  const chainId = options?.chainId ?? getDefaultChainId();
  const rpcUrl = options?.rpcUrl ?? getRpcUrl(chainId);
  const transport = http(rpcUrl);

  // Always make the user-selected chain reachable through the transports
  // map. Mainnet gets a default `http()` so EVMcrispr's initial state
  // (which always starts on mainnet) has somewhere to send RPCs.
  const transports: Record<number, Transport> = { [chainId]: transport };
  if (chainId !== mainnet.id) {
    transports[mainnet.id] = http();
  }

  const evm = new EVMcrispr(options?.from, transports);

  // EVMcrispr defaults to mainnet; if the CLI was asked to run on a
  // different chain, switch to it so the script begins on the right
  // chain (matching the previous CLI behaviour).
  if (chainId !== mainnet.id) {
    evm.switchChainId(chainId);
  }

  const logs: string[] = [];
  evm.registerLogListener((message: string) => {
    logs.push(message);
  });

  return { evm, logs };
}
