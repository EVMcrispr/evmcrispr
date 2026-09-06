import { ErrorException, Num } from "@evmcrispr/sdk";

export const decimalRounding = (value: unknown = "trunc"): 0 | 1 | 2 => {
  if (value === "trunc") return 0;
  if (value === "floor") return 1;
  if (value === "ceil") return 2;
  throw new ErrorException("Rounding must be trunc, floor or ceil");
};
export function decimalPrecision(value: unknown): number {
  const d = Num(value);
  if (!d.isInteger() || d.lt(Num(0)) || d.gt(Num(77)))
    throw new ErrorException(
      "Decimal precision must be an integer from 0 to 77",
    );
  return d.toNumber();
}
export function decimalSignedness(value: unknown = "signed"): boolean {
  if (value === "signed") return true;
  if (value === "unsigned") return false;
  throw new ErrorException("Signedness must be signed or unsigned");
}
export function parseDecimal(
  value: unknown,
  precision: unknown,
  rounding: unknown = "trunc",
  signedness: unknown = "signed",
): bigint {
  const d = decimalPrecision(precision);
  const mode = decimalRounding(rounding);
  const signed = decimalSignedness(signedness);
  const text = String(value);
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ||
    (!signed && text.startsWith("-"))
  )
    throw new ErrorException("Invalid decimal string");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const kept = fraction.slice(0, d).padEnd(d, "0");
  let result = BigInt((whole || "0") + kept);
  const remainder = /[1-9]/.test(fraction.slice(d));
  if (remainder && ((negative && mode === 1) || (!negative && mode === 2)))
    result++;
  if (negative) result = -result;
  const minimum = signed ? -(1n << 255n) : 0n;
  const maximum = signed ? (1n << 255n) - 1n : (1n << 256n) - 1n;
  if (result < minimum || result > maximum)
    throw new ErrorException(
      "Decimal result overflows the selected integer type",
    );
  return result;
}
