import { resolveToken } from "@evmcrispr/module-std";
import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { ONE_BALANCE } from "../addresses";
import { requireOneBalance } from "./protocol";

/**
 * Resolve the Gas Tank deposit token: the script must be on Polygon and the
 * token must be native USDC — the only token 1Balance accepts.
 */
export async function resolveOneBalanceToken(
  module: Module,
  token: string,
): Promise<Address> {
  await requireOneBalance(module);
  const address = await resolveToken(module, token);
  if (address.toLowerCase() !== ONE_BALANCE.usdc.toLowerCase()) {
    throw new ErrorException(
      `the Gelato Gas Tank only accepts native USDC on ${chainLabel(ONE_BALANCE.chainId)} (${ONE_BALANCE.usdc}), got ${token}`,
    );
  }
  return ONE_BALANCE.usdc;
}
