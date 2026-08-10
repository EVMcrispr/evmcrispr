import { Num } from "./Num";

/**
 * Value comparison for helpers that sort, dedup or search an array.
 *
 * These all have the same trap. A `::` call's return is normalized to `Num`
 * only when it is a TOP-LEVEL scalar, so a `uint256[]` arrives as `bigint[]`
 * while a literal, an arithmetic result or a `@num(...)` is a `Num`. A helper
 * that tests `instanceof Num` therefore takes its fallback path against live
 * chain data and answers wrongly rather than loudly: `@sort` compared numbers
 * as strings (`[9n, 10n]` sorted to `[10n, 9n]`), and `@includes` fell through
 * to `a === b` and reported a silent `false` for an element that was present.
 *
 * Comparing through here instead of on `instanceof Num` keeps the two shapes
 * interchangeable, which is what a user means by them.
 */

/** A numeric value as a `Num`, or null when it is not numeric. Accepts every
 *  shape a value can arrive in: `Num`, `bigint`, and a decimal string. */
export function asNum(value: unknown): Num | null {
  if (value instanceof Num) return value;
  if (typeof value === "bigint") return Num.fromBigInt(value);
  if (typeof value === "number") {
    // Num rejects `number` outright rather than silently taking a float's
    // rounding, so only an exact integer can convert.
    return Number.isInteger(value) ? Num.fromBigInt(BigInt(value)) : null;
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return Num(value);
  }
  return null;
}

/** Deep equality that treats every numeric shape as the same value. */
export function valueEq(a: unknown, b: unknown): boolean {
  const [x, y] = [asNum(a), asNum(b)];
  if (x && y) return x.eq(y);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valueEq(v, b[i]));
  }
  return a === b;
}

/**
 * Natural order: numerically when both sides are numeric, otherwise by string
 * form. Used as the default comparator, so it must be total across mixed
 * arrays — a numeric and a non-numeric value still have to order somehow.
 */
export function naturalCompare(a: unknown, b: unknown): number {
  const [x, y] = [asNum(a), asNum(b)];
  if (x && y) return x.eq(y) ? 0 : x.lt(y) ? -1 : 1;
  const [s, t] = [String(a), String(b)];
  return s === t ? 0 : s < t ? -1 : 1;
}

/**
 * A stable identity key for set membership.
 *
 * Numbers key on their exact fraction rather than `String(item)`, because
 * `Num.toString()` renders through an 18-decimal truncation while
 * `bigint.toString()` does not — so the same value reached by two routes
 * would otherwise get two different keys.
 */
export function valueKey(value: unknown): string {
  const n = asNum(value);
  return n ? `n:${n.toFractionString()}` : `s:${String(value)}`;
}
