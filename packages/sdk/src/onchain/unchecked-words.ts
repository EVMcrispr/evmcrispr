/**
 * The raw read behind a type-checked narrow read (see `narrow-words.ts`),
 * keyed by the checked param itself, so a param a caller transformed can
 * never pick up a raw read for something else. No runtime imports: the
 * core encoders and the call constructor consult it, and `narrow-words`
 * builds on both.
 */
import type { InputParam } from "./erc8211";

const ADDRESS_MAX = (1n << 160n) - 1n;

/** The valid words of a one-word ABI type: undefined when every word is
 *  valid (the 256-bit types), `max` when they are exactly 0..max, and an
 *  empty object for the other narrow types (intN, bytesN). */
export function wordRange(type: string): { max?: bigint } | undefined {
  if (type === "address") return { max: ADDRESS_MAX };
  if (type === "bool") return { max: 1n };
  const int = /^(u?)int(\d+)$/.exec(type);
  if (int) {
    const bits = Number(int[2]);
    if (bits % 8 !== 0 || bits < 8 || bits >= 256) return undefined;
    return int[1] ? { max: (1n << BigInt(bits)) - 1n } : {};
  }
  const fixed = /^bytes(\d+)$/.exec(type);
  if (fixed) {
    const size = Number(fixed[1]);
    return size >= 1 && size < 32 ? {} : undefined;
  }
  return undefined;
}

const unchecked = new WeakMap<InputParam, { raw: InputParam; max: bigint }>();

/** Record `raw` as the unchecked read behind the checked `param`, whose
 *  type's valid words are exactly 0..`max`. */
export function recordUnchecked(
  param: InputParam,
  raw: InputParam,
  max: bigint,
): void {
  unchecked.set(param, { raw, max });
}

/** The raw read behind a checked one, and the largest valid word, when an
 *  interval constraint may judge it directly. */
export function uncheckedWord(
  param: InputParam,
): { raw: InputParam; max: bigint } | undefined {
  return unchecked.get(param);
}

/**
 * The read to hand the core as a call target. The core's `read`, `get`
 * and `chain` refuse a target word with dirty upper bytes themselves
 * (`InvalidAddressWord`), so a checked address read goes in raw: the
 * check would only repeat theirs.
 */
export function targetRead(param: InputParam): InputParam {
  const word = unchecked.get(param);
  return word?.max === ADDRESS_MAX ? word.raw : param;
}

/**
 * The read to pass as an argument of ABI type `type`. A checked read of a
 * type with the same valid words goes in raw: a callee that decodes the
 * argument refuses a word out of range or cleans it to a valid value, and
 * `get` encodes it through the core's codec, which refuses it, so neither
 * can see a value the source's type could not hold. A wider destination
 * (a `uint8` passed as `uint256`) keeps the check.
 */
export function argumentRead(param: InputParam, type: string): InputParam {
  const word = unchecked.get(param);
  return word !== undefined && wordRange(type)?.max === word.max
    ? word.raw
    : param;
}

/**
 * The read to hand `cond` as its condition. `cond` asks only whether the
 * word is nonzero, and a word out of its type's range is never zero, so
 * the raw word decides like some valid nonzero value would: the check
 * changes no branch.
 */
export function conditionRead(param: InputParam): InputParam {
  return unchecked.get(param)?.raw ?? param;
}
