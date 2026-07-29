import type { Address } from "viem";

/** Case-insensitive address equality. */
export function sameAddress(a?: Address, b?: Address): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
