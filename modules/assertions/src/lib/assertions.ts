import type { Address, Module, TransactionAction } from "@evmcrispr/sdk";
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
