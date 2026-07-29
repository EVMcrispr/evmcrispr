import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem, isNum } from "@evmcrispr/sdk";
import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { fuseNames, parseFuse } from "./fuses";

/**
 * Map of viem chain export name → chain id (e.g. `mainnet` → 1,
 * `optimism` → 10), mirroring the std module's `chain` arg type.
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

/** Reverse lookup: chain id → viem chain export name (first match wins). */
const chainIdToName: Record<number, string> = Object.entries(
  chainNameToId,
).reduce(
  (acc, [name, id]) => {
    if (acc[id] === undefined) acc[id] = name;
    return acc;
  },
  {} as Record<number, string>,
);

export function chainNameOf(chainId: number): string | undefined {
  return chainIdToName[chainId];
}

/**
 * Resolve a `chain`-typed value to a numeric chain id. Accepts a numeric id
 * or a viem chain export name like `mainnet`, `optimism`, `base`.
 */
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
  fuse: {
    validate(_, value) {
      parseFuse(String(value));
    },
    completions() {
      return fuseNames().map(fieldItem);
    },
  },
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
      return Object.keys(chainNameToId).map(fieldItem);
    },
  },
};
