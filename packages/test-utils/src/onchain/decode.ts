import { asNum, Num } from "@evmcrispr/sdk";
import type { ResolvedValue } from "@evmcrispr/sdk/onchain";
import type { Hex } from "viem";
import { getAddress, isAddress, isHex } from "viem";

// The decoder itself lives in the SDK now (an editor previews values with
// it); the harness keeps its normalization and comparison vocabulary.
export {
  abiTypeOfCategory,
  decodeResolved,
  decodeWord,
} from "@evmcrispr/sdk/onchain";

/**
 * A value reduced to a form both faces can be compared in: the SDK's
 * `ResolvedValue`, under the name the harness has always used.
 */
export type Norm = ResolvedValue;

/** Normalize an off-chain (`run`) result. */
export function normalizeRun(value: unknown): Norm {
  if (Array.isArray(value)) return { t: "list", v: value.map(normalizeRun) };
  if (typeof value === "boolean") return { t: "bool", v: value };
  if (value instanceof Num) return { t: "num", v: value };
  // A raw bigint reaches here because the interpreter converts only a
  // TOP-LEVEL bigint to Num, so a uint256[] from a `::` call arrives as
  // bigint[]. Accepting both is the harness declining to hide that: the
  // helpers that compare values themselves are where it actually bites.
  if (typeof value === "bigint") return { t: "num", v: Num.fromBigInt(value) };
  // And a JS number reaches here because viem decodes any int of 48 bits or
  // fewer as one: a `decimals()(uint8)` read is 18, not 18n. A helper that
  // passes a branch through untouched (@orElse) hands that straight back.
  if (typeof value === "number") return { t: "num", v: Num(value) };
  if (typeof value === "string") {
    if (isAddress(value)) return { t: "addr", v: getAddress(value) };
    if (isHex(value)) return { t: "hex", v: value.toLowerCase() as Hex };
    return { t: "str", v: value };
  }
  throw new Error(
    `cannot normalize a ${typeof value} run result: ${String(value)}`,
  );
}

/**
 * Structural equality.
 *
 * Deliberately strict: kinds must match, so an Address is not a bytes20 and a
 * bool is not 0/1. Every coercion allowed here would be a real divergence
 * that no test could ever see again.
 */
export function sameValue(a: Norm, b: Norm): boolean {
  [a, b] = bridgeScalar(a, b);
  if (a.t !== b.t) return false;
  if (a.t === "num") {
    // Num.eq compares exact rationals. toString() truncates at 18 decimals
    // and would call distinct values equal.
    return a.v.eq((b as typeof a).v);
  }
  if (a.t === "list") {
    const other = (b as typeof a).v;
    return (
      a.v.length === other.length &&
      a.v.every((x, i) => sameValue(x, other[i]!))
    );
  }
  return a.v === (b as { v: unknown }).v;
}

/**
 * The one class of coercion the harness allows: EVML is stringly typed at the
 * value boundary, so `"true"` IS a boolean and `"18"` IS a number. Off-chain
 * helpers return both shapes freely — `@includes` returns `"true"`,
 * `@token:decimals` returns `"18"` — and the language agrees with itself about
 * it: `isNum` accepts a decimal string, and the compiler folds `"true"` to a
 * Bool constant. Refusing the bridge would flag every bool and every
 * string-returning numeric helper as divergent over a difference the language
 * does not recognise.
 *
 * Narrow on purpose: a bridge only fires when the OTHER side is genuinely of
 * that kind, so a String-category result that happens to read "true" or "18"
 * still compares as a string.
 */
function bridgeScalar(a: Norm, b: Norm): [Norm, Norm] {
  const toBool = (n: Norm): Norm =>
    n.t === "str" && (n.v === "true" || n.v === "false")
      ? { t: "bool", v: n.v === "true" }
      : n;
  const toNum = (n: Norm): Norm => {
    if (n.t !== "str") return n;
    const v = asNum(n.v);
    return v ? { t: "num", v } : n;
  };
  if (a.t === "bool" && b.t === "str") return [a, toBool(b)];
  if (b.t === "bool" && a.t === "str") return [toBool(a), b];
  if (a.t === "num" && b.t === "str") return [a, toNum(b)];
  if (b.t === "num" && a.t === "str") return [toNum(a), b];
  return [a, b];
}

/** Render a Norm for a failure message. */
export function show(n: Norm): string {
  switch (n.t) {
    case "num":
      return n.v.isInteger()
        ? n.v.toBigInt().toString()
        : n.v.toFractionString();
    case "list":
      return `[${n.v.map(show).join(", ")}]`;
    case "str":
      return JSON.stringify(n.v);
    default:
      return String(n.v);
  }
}
