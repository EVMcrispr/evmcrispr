import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorNotFound } from "@evmcrispr/sdk";
import { AUTOMATE_CHAINS, ONE_BALANCE } from "../addresses";

/** Chain id after checking Gelato Automate is deployed there. */
export async function requireAutomate(module: Module): Promise<number> {
  const chainId = await module.getChainId();
  if (!AUTOMATE_CHAINS.includes(chainId)) {
    throw new ErrorNotFound(
      `Gelato Automate is not deployed on ${chainLabel(chainId)} (see https://docs.gelato.cloud)`,
    );
  }
  return chainId;
}

/** Fail unless the script is on Polygon, where the Gas Tank lives. */
export async function requireOneBalance(module: Module): Promise<void> {
  const chainId = await module.getChainId();
  if (chainId !== ONE_BALANCE.chainId) {
    throw new ErrorNotFound(
      `the Gelato Gas Tank lives on ${chainLabel(ONE_BALANCE.chainId)} — run this on ${chainLabel(ONE_BALANCE.chainId)} (switch polygon), not ${chainLabel(chainId)}`,
    );
  }
}
