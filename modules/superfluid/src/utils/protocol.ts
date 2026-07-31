import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorNotFound } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { SUPERFLUID_HOST } from "../addresses";

/** Chain id after checking the Superfluid protocol is deployed there. */
export async function requireCore(module: Module): Promise<number> {
  const chainId = await module.getChainId();
  if (!SUPERFLUID_HOST[chainId]) {
    throw new ErrorNotFound(
      `Superfluid is not deployed on ${chainLabel(chainId)} (see https://explorer.superfluid.finance/protocol)`,
    );
  }
  return chainId;
}

/** Resolve a peripheral singleton, failing clearly on unsupported chains. */
export function requirePeripheral(
  map: Record<number, Address>,
  chainId: number,
  label: string,
): Address {
  const address = map[chainId];
  if (!address) {
    throw new ErrorNotFound(
      `Superfluid ${label} is not deployed on ${chainLabel(chainId)}`,
    );
  }
  return address;
}
