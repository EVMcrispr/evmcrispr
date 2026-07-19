import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { ErrorException } from "../errors";
import { isNum } from "./args";
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

/**
 * Resolve a value coming from a `chain`-typed arg/opt to a numeric chain id.
 * Accepts either a numeric chain id or a viem chain export name like
 * `mainnet`, `optimism`, `base`. Throws on unknown values.
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
    `unknown chain "${String(value)}" — pass a numeric chain id or a viem chain name (e.g. mainnet, optimism, base)`,
  );
}

/**
 * The `chain` custom arg type: a numeric chain id or a viem chain export
 * name. Shared by every module that takes chain-valued args/opts (std
 * `switch`, contracts `deploy`/`verify` mirror opts); each module exposes it
 * through its own `types` map.
 */
export const chainArgType: CustomArgType = {
  validate(name, value) {
    if (isNum(value)) {
      const n = Number(String(value));
      if (Number.isInteger(n) && n > 0) return;
    }
    if (typeof value === "string" && chainNameToId[value] !== undefined) {
      return;
    }
    throw new ErrorException(
      `${name} must be a chain id or a known chain name (e.g. mainnet, optimism, base), got ${value}`,
    );
  },
  completions() {
    return Object.keys(chainNameToId).map(fieldItem);
  },
};
