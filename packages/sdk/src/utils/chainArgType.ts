import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { ErrorException } from "../errors";
import { isNum } from "./args";
import { registeredChains } from "./chains";
import type { CustomArgType } from "./schema";
import { fieldItem } from "./schema";

/**
 * Map of viem chain export name → chain id (e.g. `mainnet` → 1,
 * `optimism` → 10). Built once at module load from `viem/chains`.
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

/** Chain id for a script-level chain name: a chain some module declared
 *  (its `key`) first, then viem's export names. */
export function chainIdForName(name: string): number | undefined {
  const declared = registeredChains().find((c) => c.key === name);
  return declared?.id ?? chainNameToId[name];
}

/** Script-level name for a chain id (the reverse of `chainIdForName`). */
export function chainNameForId(chainId: number): string | undefined {
  const declared = registeredChains().find((c) => c.id === chainId);
  if (declared) return declared.key;
  return Object.entries(chainNameToId).find(([, id]) => id === chainId)?.[0];
}

/** Every name `chainIdForName` accepts: declared keys, then viem's. */
export function chainNames(): string[] {
  const declared = registeredChains().map((c) => c.key);
  return [
    ...declared,
    ...Object.keys(chainNameToId).filter((n) => !declared.includes(n)),
  ];
}

/**
 * Resolve a value coming from a `chain`-typed arg/opt to a numeric chain id.
 * Accepts either a numeric chain id or a chain name: a key declared by a
 * module (`eezL1`) or a viem chain export name like `mainnet`, `optimism`,
 * `base`. Throws on unknown values.
 */
export function resolveChainId(value: unknown): number {
  if (isNum(value)) {
    const n = Number(String(value));
    if (Number.isInteger(n) && n > 0) return n;
  }
  if (typeof value === "string") {
    const id = chainIdForName(value);
    if (id !== undefined) return id;
  }
  throw new ErrorException(
    `unknown chain "${String(value)}" — pass a numeric chain id or a camelCase chain name (e.g. mainnet, baseSepolia, polygonZkEvm)`,
  );
}

/**
 * The `chain` custom arg type: a numeric chain id or a chain name. Shared
 * by every module that takes chain-valued args/opts (std `switch`,
 * contracts `deploy`/`verify` mirror opts); each module exposes it through
 * its own `types` map.
 */
export const chainArgType: CustomArgType = {
  validate(name, value) {
    if (isNum(value)) {
      const n = Number(String(value));
      if (Number.isInteger(n) && n > 0) return;
    }
    if (typeof value === "string" && chainIdForName(value) !== undefined) {
      return;
    }
    throw new ErrorException(
      `${name} must be a chain id or a camelCase chain name (e.g. mainnet, baseSepolia, polygonZkEvm), got ${value}`,
    );
  },
  completions() {
    return chainNames().map(fieldItem);
  },
};
