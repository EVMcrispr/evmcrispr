import type { Module } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import { activeSimMode } from "../utils/sim";
import aaveV3 from "./aave-v3";
import compoundV3 from "./compound-v3";
import spark from "./spark";
import type { LendingAdapter } from "./types";

/** All adapters, keyed by lowercased name (--using is case-insensitive). */
export const ADAPTERS: Record<string, LendingAdapter> = Object.fromEntries(
  [aaveV3, spark, compoundV3].map((a) => [a.name.toLowerCase(), a]),
);

/** Preference order for implicit adapter selection. */
export const DEFAULT_ORDER: LendingAdapter[] = [aaveV3, spark, compoundV3];

/**
 * Pick the lending adapter: the --using value when given (validated against
 * the current chain and sim mode), otherwise the first adapter in
 * DEFAULT_ORDER that fits.
 */
export async function resolveAdapter(
  module: Module,
  name: string | undefined,
): Promise<LendingAdapter> {
  const chainId = await module.getChainId();
  const sim = activeSimMode(module);

  if (name !== undefined) {
    const adapter = ADAPTERS[name.toLowerCase()];
    if (!adapter) {
      const known = Object.values(ADAPTERS)
        .map((a) => a.name)
        .join(", ");
      throw new ErrorNotFound(
        `unknown lending adapter "${name}" (known: ${known})`,
      );
    }
    if (!adapter.supports(chainId)) {
      throw new ErrorException(
        `${adapter.name} is not available on chain ${chainId}`,
      );
    }
    if (sim && adapter.kind !== "onchain") {
      throw new ErrorException(
        `${adapter.name} depends on off-chain APIs and is not deterministic inside a simulation`,
      );
    }
    return adapter;
  }

  for (const adapter of DEFAULT_ORDER) {
    if (!adapter.supports(chainId)) continue;
    if (sim && adapter.kind !== "onchain") continue;
    return adapter;
  }
  throw new ErrorNotFound(`no lending adapter available on chain ${chainId}`);
}

type ReadMethod = "healthFactor" | "apy" | "maxBorrow" | "debt";

/** Get an optional read method, failing clearly when the adapter lacks it. */
export function requireRead<K extends ReadMethod>(
  adapter: LendingAdapter,
  method: K,
): NonNullable<LendingAdapter[K]> {
  const fn = adapter[method];
  if (!fn) {
    throw new ErrorException(`${adapter.name} does not expose ${method}`);
  }
  return fn;
}
