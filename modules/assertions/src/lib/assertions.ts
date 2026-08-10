import type { Address, Module, Num, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import {
  CORE_ADDRESS,
  encodeAssertParam,
  type InputParam,
  resolveCoreAddress,
  resolveOperatorsAddress,
} from "@evmcrispr/sdk/onchain";

/** Canonical address of the Assertions core v2.0 (interim deployment) —
 *  the historical name of the shared layer's `CORE_ADDRESS`. */
export const ASSERTIONS_ADDRESS: Address = CORE_ADDRESS;

/** Canonical address of the Operators v1.0 (interim deployment). */
/** ABI loading moved to the shared layer; re-exported for old importers. */
export { loadFunctionAbi, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";

/**
 * Resolve the assertions core contract address. Honours the
 * `$assertions:address` override when set, otherwise uses the canonical
 * deployment. Thin wrapper over the shared layer's `resolveCoreAddress`.
 */
export async function resolveAssertionsContract(
  module: Module,
): Promise<Address> {
  return resolveCoreAddress(module.bindingsManager);
}

/**
 * Resolve the operators contract address. Honours the
 * `$assertions:operators` override when set, otherwise uses the canonical
 * deployment. Thin wrapper over the shared layer's
 * `resolveOperatorsAddress`.
 */
export async function resolveOperatorsContract(
  module: Module,
): Promise<Address> {
  return resolveOperatorsAddress(module.bindingsManager);
}

/**
 * Encode an `assertParam(param[, message])` action against the assertions
 * contract, flagged `readOnly` so it runs as an `eth_call` check when
 * executed standalone, but as a real atomic call when included in a batch.
 */
export async function assertParamAction(
  module: Module,
  param: InputParam,
  message = "",
): Promise<TransactionAction> {
  const target = await resolveAssertionsContract(module);
  return {
    to: target,
    data: encodeAssertParam(param, message),
    readOnly: true,
  };
}

/**
 * The value side of an on-chain comparison is always an integer word, so a
 * fractional bound has an EXACT integer equivalent: round it the way the
 * predicate points and the predicate is unchanged. `x >= 0.5` is exactly
 * `x >= 1`; `x <= 1.9` is exactly `x <= 1`. Equality has no such form.
 *
 * Rate literals make this everyday rather than exotic: `1000e18/mo` is the
 * rational 10^21/2592000, so `>= 1000e18/mo` means `>= 385802469135803`,
 * one wei/second above the floor.
 */
const BOUND_ROUNDING: Record<string, "floor" | "ceil"> = {
  Ge: "ceil",
  Gt: "floor",
  Le: "floor",
  Lt: "ceil",
};

/**
 * The integer word a comparison bound resolves to. Whole numbers pass
 * through; fractions round in the predicate-preserving direction, and the
 * comparisons that have no such form say so instead of truncating.
 */
export function boundWord(
  value: Num,
  fragment: string,
  /** What the user actually wrote, when `value` has already been scaled up
   *  to meet the live side — otherwise an error would quote 5e25 at
   *  someone who typed 0.05. */
  display: Num = value,
): bigint {
  if (value.isInteger()) return value.toBigInt();
  const mode = BOUND_ROUNDING[fragment];
  if (mode === "ceil") return value.ceilBigInt();
  if (mode === "floor") return value.floorBigInt();
  if (fragment === "Eq") {
    throw new ErrorException(
      `no whole number equals ${display} — this assertion could never hold. Bound it with >= and <=, or scale both sides to base units.`,
    );
  }
  if (fragment === "Ne") {
    throw new ErrorException(
      `every whole number differs from ${display} — this assertion always holds. Bound it with >= and <=, or scale both sides to base units.`,
    );
  }
  throw new ErrorException(
    `~= needs a whole-number centre, got ${display} — round it and widen --delta, or bound the value with >= and <=`,
  );
}

/** A tolerance is counted in base units, so a fraction is a mistake rather
 *  than something to round. */
export function wholeDelta(value: Num, display: Num = value): bigint {
  if (!value.isInteger()) {
    throw new ErrorException(
      `--delta must be a whole number of base units, got ${display}`,
    );
  }
  return value.toBigInt();
}

/** Map a DSL comparison operator to its assertions-contract name fragment. */
const OPERATORS: Record<string, string> = {
  "==": "Eq",
  "!=": "Ne",
  ">": "Gt",
  "<": "Lt",
  ">=": "Ge",
  "<=": "Le",
  "~=": "ApproxEq",
};

/**
 * Translate an operator token into its contract name fragment (e.g. `>=` ->
 * `Ge`), validating it is one of `allowed`.
 */
export function operatorFragment(op: string, allowed: string[]): string {
  const fragment = OPERATORS[op];
  if (!fragment) {
    throw new ErrorException(
      `unknown comparison operator "${op}". Use one of ${Object.keys(
        OPERATORS,
      ).join(", ")}`,
    );
  }
  if (!allowed.includes(fragment)) {
    throw new ErrorException(
      `operator "${op}" is not supported here. Allowed operators: ${allowed
        .map((f) => operatorToken(f))
        .join(", ")}`,
    );
  }
  return fragment;
}

function operatorToken(fragment: string): string {
  const entry = Object.entries(OPERATORS).find(([, f]) => f === fragment);
  return entry ? entry[0] : fragment;
}
