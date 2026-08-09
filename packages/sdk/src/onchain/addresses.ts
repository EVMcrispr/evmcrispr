import { getAddress, isAddress } from "viem";
import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type { Address } from "../types";
import { BindingsSpace } from "../types";

/** Canonical address of the Assertions core v2.0 (interim deployment). */
export const CORE_ADDRESS: Address =
  "0x637d99Ff8bcB919e5203b0B96Ad0520A9943a32C";

/** Canonical address of the Operators v1.0 (interim deployment). */
export const OPERATORS_ADDRESS: Address =
  "0xaE0a2f9A3065CE8E1Dd6D1007c32D0bCF6e5D4b9";

function resolveOverride(
  bindings: BindingsManager,
  key: string,
): Address | undefined {
  const override = bindings.getBindingValue(
    `$assertions:${key}`,
    BindingsSpace.USER,
  );
  if (override === undefined || override === null) return undefined;
  const addr = String(override);
  if (!isAddress(addr)) {
    throw new ErrorException(
      `$assertions:${key} must be a valid address, got ${addr}`,
    );
  }
  return getAddress(addr);
}

/**
 * Resolve the assertions core contract address. Honours the
 * `$assertions:address` USER binding when set, otherwise uses the
 * canonical deployment.
 */
export function resolveCoreAddress(bindings: BindingsManager): Address {
  return resolveOverride(bindings, "address") ?? CORE_ADDRESS;
}

/**
 * Resolve the operators contract address. Honours the
 * `$assertions:operators` USER binding when set, otherwise uses the
 * canonical deployment.
 */
export function resolveOperatorsAddress(bindings: BindingsManager): Address {
  return resolveOverride(bindings, "operators") ?? OPERATORS_ADDRESS;
}
