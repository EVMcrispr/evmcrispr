import { ErrorException, Num } from "@evmcrispr/sdk";

/**
 * Coerce the interpreted rest values of a variadic math helper into Nums,
 * the off-chain mirror of the compile faces' `variadicOperands` (minus the
 * one-array-of-them shape, which only on-chain operand lists carry).
 */
export function numericValues(values: unknown, helper: string): Num[] {
  const list = Array.isArray(values) ? values : [];
  if (list.length < 2) {
    throw new ErrorException(`@${helper} needs at least two operands`);
  }
  return list.map((v) => {
    try {
      return Num(v);
    } catch {
      throw new ErrorException(`@${helper} operands must be numeric`);
    }
  });
}
