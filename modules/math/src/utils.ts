import { asNum, ErrorException, type Num } from "@evmcrispr/sdk";

/**
 * Coerce the interpreted rest values of a variadic math helper into Nums,
 * the off-chain mirror of the compile faces' `variadicOperands`.
 *
 * That includes the one-array-of-them shape: `@max([1 2 3])` is what the
 * argument description has always promised and what `@max!` accepts, and it
 * is also the shape a live `uint256[]` read arrives in, so rejecting it made
 * the array form on-chain-only for no reason a caller could see.
 */
export function numericValues(values: unknown, helper: string): Num[] {
  let list = Array.isArray(values) ? values : [];
  // A single array argument IS the operand list. Unwrapped before the arity
  // check, so `@max([1 2 3])` counts three operands rather than one.
  if (list.length === 1 && Array.isArray(list[0])) {
    list = list[0];
  }
  if (list.length < 2) {
    throw new ErrorException(`@${helper} needs at least two operands`);
  }
  return list.map((v) => {
    // asNum, not Num(v): the elements of a live uint256[] are raw bigint, and
    // Num throws outright on a JS number rather than coercing.
    const n = asNum(v);
    if (!n) {
      throw new ErrorException(`@${helper} operands must be numeric`);
    }
    return n;
  });
}
