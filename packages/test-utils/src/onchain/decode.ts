import { asNum, Num } from "@evmcrispr/sdk";
import type { Category } from "@evmcrispr/sdk/onchain";
import type { Address, Hex } from "viem";
import { decodeAbiParameters, getAddress, isAddress, isHex } from "viem";

/**
 * A value reduced to a form both faces can be compared in.
 *
 * The two sides speak different type systems: off-chain a value is a JS
 * string / boolean / `Num` / array, on-chain it is 32-byte words plus a
 * category and an optional decimal scale. Neither is a superset, so both are
 * normalized into this instead of one being coerced towards the other.
 */
export type Norm =
  | { t: "num"; v: Num }
  | { t: "bool"; v: boolean }
  | { t: "addr"; v: Address }
  | { t: "str"; v: string }
  | { t: "hex"; v: Hex }
  | { t: "list"; v: Norm[] };

/** The inverse of `categoryFromAbiType`. Lives here rather than in the SDK
 *  because nothing in production decodes a resolved value — promote it if a
 *  real consumer ever appears. */
const ABI_TYPE: Record<Category, string> = {
  Uint: "uint256",
  Int: "int256",
  Address: "address",
  Bool: "bool",
  Bytes32: "bytes32",
  String: "string",
  Bytes: "bytes",
};

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
 * Decode what `Assertions.resolve` raw-returned.
 *
 * `decodeAs` is needed whenever the category cannot say what the bytes mean —
 * in practice any array, because an on-chain array is just a `Bytes` payload
 * of packed words and the operand carries no element type.
 */
export function decodeResolved(
  data: Hex,
  cat: Category,
  scale = 0,
  decodeAs?: string,
): Norm {
  if (decodeAs?.endsWith("[]")) {
    // A words payload: the resolved bytes are the ABI-encoded `bytes` return
    // of the Operators call, and INSIDE that envelope the words are packed
    // bare — no length head, no offsets.
    const [payload] = decodeAbiParameters([{ type: "bytes" }], data) as [Hex];
    const elem = decodeAs.slice(0, -2);
    const words: Norm[] = [];
    for (let i = 2; i + 64 <= payload.length; i += 64) {
      words.push(
        decodeWord(`0x${payload.slice(i, i + 64)}` as Hex, elem, scale),
      );
    }
    return { t: "list", v: words };
  }

  if (cat === "String" || cat === "Bytes") {
    const [v] = decodeAbiParameters(
      [{ type: decodeAs ?? ABI_TYPE[cat] }],
      data,
    ) as [string];
    return cat === "String"
      ? { t: "str", v }
      : { t: "hex", v: v.toLowerCase() as Hex };
  }

  // Word categories: take the FIRST word rather than round-tripping through
  // decodeAbiParameters, which is strict about trailing data — a `::` call
  // with several outputs resolves to more than one word.
  if (data.length < 66) {
    throw new Error(
      `resolve returned ${(data.length - 2) / 2} bytes, expected at least a word`,
    );
  }
  return decodeWord(data.slice(0, 66) as Hex, decodeAs ?? ABI_TYPE[cat], scale);
}

function decodeWord(word: Hex, abiType: string, scale: number): Norm {
  const raw = BigInt(word);
  if (abiType === "bool") return { t: "bool", v: raw !== 0n };
  if (abiType === "address") {
    return { t: "addr", v: getAddress(`0x${word.slice(26)}`) };
  }
  if (abiType.startsWith("bytes")) {
    return { t: "hex", v: word.toLowerCase() as Hex };
  }
  // Two's complement: an int word above the sign bit is negative. Done here
  // rather than by viem because this path never sees an ABI envelope.
  const v =
    abiType.startsWith("int") && raw >= 1n << 255n ? raw - (1n << 256n) : raw;
  // The word IS the real value times 10^scale, so the scale divides back out
  // exactly — Num is a rational, not a float.
  return { t: "num", v: Num(v, 10n ** BigInt(scale)) };
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
