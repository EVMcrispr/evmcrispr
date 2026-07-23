import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem, isNum } from "@evmcrispr/sdk";
import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { ADAPTERS } from "./adapters/registry";
import { SUPPORTED_CHAINS } from "./addresses";

/**
 * Map of viem chain export name → chain id (e.g. `mainnet` → 1). Custom arg
 * types are per-module, so this mirrors std's `chain` type rather than
 * importing it (modules don't depend on each other).
 */
const chainNameToId: Record<string, number> = Object.entries(viemChains).reduce(
  (acc, [name, chain]) => {
    if (chain && typeof chain === "object" && "id" in chain) {
      const id = (chain as Chain).id;
      if (typeof id === "number") acc[name] = id;
    }
    return acc;
  },
  {} as Record<string, number>,
);

/** Resolve a `chain`-typed arg to a numeric chain id. */
export function resolveChainId(value: unknown): number {
  if (isNum(value)) {
    const n = Number(String(value));
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (typeof value === "string" && chainNameToId[value] !== undefined) {
    return chainNameToId[value];
  }
  throw new ErrorException(
    `unknown chain "${String(value)}" — pass a numeric chain id or a camelCase viem chain name (e.g. mainnet, baseSepolia, polygonZkEvm)`,
  );
}

export const types: CustomArgTypes = {
  chain: {
    validate(name, value) {
      if (isNum(value)) {
        const n = Number(String(value));
        if (Number.isInteger(n) && n > 0) return;
      }
      if (typeof value === "string" && chainNameToId[value] !== undefined) {
        return;
      }
      throw new ErrorException(
        `${name} must be a chain id or a camelCase viem chain name (e.g. mainnet, baseSepolia, polygonZkEvm), got ${value}`,
      );
    },
    completions() {
      const names = Object.entries(chainNameToId)
        .filter(([, id]) => SUPPORTED_CHAINS.includes(id as any))
        .map(([name]) => name);
      return names.map((name) => fieldItem(name));
    },
  },

  "bridge-adapter": {
    validate(name, value) {
      if (typeof value !== "string" || !ADAPTERS[value.toLowerCase()]) {
        const known = Object.values(ADAPTERS)
          .map((a) => a.name)
          .join(", ");
        throw new ErrorException(
          `${name} must be one of ${known}, got ${value}`,
        );
      }
    },
    completions(ctx) {
      const adapters = Object.values(ADAPTERS).filter(
        (adapter) =>
          !ctx.chainId ||
          SUPPORTED_CHAINS.some((dst) =>
            adapter.supports(ctx.chainId as number, dst),
          ),
      );
      return adapters.map((a) => fieldItem(a.name));
    },
  },
};
