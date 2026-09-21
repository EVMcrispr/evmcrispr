import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import { cowTwap } from "./cow";
import { TWAP_CREATION_CHAINS } from "./networks";
import type { TwapAdapter } from "./types";

export const TWAP_PROVIDERS: Record<string, TwapAdapter> = { cowswap: cowTwap };

export async function resolveTwap(
  module: Module,
  name = "CoWSwap",
  creating = false,
): Promise<TwapAdapter> {
  const provider = TWAP_PROVIDERS[name.toLowerCase()];
  if (!provider)
    throw new ErrorException(
      `${name} does not support TWAP orders (supported: CoWSwap)`,
    );
  const chain = await module.getChainId();
  if (!provider.supports(chain))
    throw new ErrorException(
      `${provider.name} TWAP is not available on ${chainLabel(chain)}`,
    );
  if (creating && !TWAP_CREATION_CHAINS.has(chain))
    throw new ErrorException(
      `CoWSwap TWAP creation has no verified service support on ${chainLabel(chain)}`,
    );
  return provider;
}
