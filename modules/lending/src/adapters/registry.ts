import type { Module } from "@evmcrispr/sdk";
import { chainLabel, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
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
        `${adapter.name} is not available on ${chainLabel(chainId)}`,
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
  throw new ErrorNotFound(
    `no lending adapter available on ${chainLabel(chainId)}`,
  );
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

type CompileMethod = "compileApy" | "compileHealthFactor" | "compileDebt";

const COMPILE_OF: Record<ReadMethod & string, CompileMethod | undefined> = {
  apy: "compileApy",
  healthFactor: "compileHealthFactor",
  debt: "compileDebt",
  // maxBorrow prices collateral by walking every listed asset on Comet,
  // and a loop has no composition at any node count.
  maxBorrow: undefined,
};

/**
 * Get an adapter's on-chain form of a read.
 *
 * Being readable off-chain does not imply being expressible on-chain, so
 * this is a separate capability rather than a derived one: Comet prices a
 * borrow by looping over every collateral asset, and a loop has no
 * composition at any node count. Where that is the case the adapter omits
 * the slot and the error says which protocol cannot do it, rather than a
 * face quietly meaning something else.
 */
/** The compile face matching a read, so call sites keep exact arities. */
type CompileOf<K extends ReadMethod> = K extends "apy"
  ? NonNullable<LendingAdapter["compileApy"]>
  : K extends "healthFactor"
    ? NonNullable<LendingAdapter["compileHealthFactor"]>
    : K extends "debt"
      ? NonNullable<LendingAdapter["compileDebt"]>
      : never;

export function requireCompile<K extends ReadMethod>(
  adapter: LendingAdapter,
  method: K,
): CompileOf<K> {
  const key = COMPILE_OF[method];
  const fn = key ? adapter[key] : undefined;
  if (!fn) {
    throw new ErrorException(
      `${adapter.name} cannot evaluate ${method} on-chain — use the plain @${method} face, or pass --using with a protocol that can`,
    );
  }
  return fn as CompileOf<K>;
}
