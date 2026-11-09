/**
 * Narrow one-word reads. A returned word declared `uint8`, `int96`,
 * `address`, `bool` or `bytes4` is the author's claim about the target,
 * and a target that breaks it (0x100 for a `uint8`) must not reach a
 * constraint or an Operations call as if it were a value of that type: an
 * ERC-8211 constraint judges the raw word, and `uint256`/`int256`
 * parameters accept every word. Such a read goes through the core's `nav`,
 * which range-checks the word for its declared type the way solc's decoder
 * does.
 *
 * `nav` costs a core frame and a descriptor parse per read. Where an
 * unsigned interval constraint judges the word directly, the check is
 * free instead: the interval is cut to the type's range, so every word out
 * of range fails it. The cheaper raw read is recorded beside the checked
 * one (`unchecked-words.ts`). A checked address handed to the core as a
 * call target goes in raw too, since the core checks targets itself.
 */
import type { AbiParameter, Address } from "viem";
import { headWords, isDynamicParam } from "./construct";
import { encodeNav } from "./core";
import { type InputParam, staticCallParam } from "./erc8211";
import { recordUnchecked, wordRange } from "./unchecked-words";

/**
 * The value at head word `word` of a return tuple, as a `nav` path and its
 * type, when that word is a whole one-word value: static tuples and fixed
 * arrays are entered, a dynamic value's head word is its offset and
 * selects nothing. A negative index counts from the end when the whole
 * tuple is static. Undefined when the word holds no one-word value.
 */
export function wordLeaf(
  outputs: readonly AbiParameter[],
  word: bigint,
): { path: bigint[]; type: string } | undefined {
  if (word < 0n) {
    if (outputs.some(isDynamicParam)) return undefined;
    const total = outputs.reduce((n, p) => n + headWords(p), 0);
    word += BigInt(total);
    if (word < 0n) return undefined;
  }
  return leafIn(outputs, Number(word), []);
}

function leafIn(
  params: readonly AbiParameter[],
  word: number,
  path: bigint[],
): { path: bigint[]; type: string } | undefined {
  let at = 0;
  for (let i = 0; i < params.length; i++) {
    const width = headWords(params[i]);
    if (word < at + width)
      return leafOf(params[i], word - at, [...path, BigInt(i)]);
    at += width;
  }
  return undefined;
}

function leafOf(
  p: AbiParameter,
  word: number,
  path: bigint[],
): { path: bigint[]; type: string } | undefined {
  if (isDynamicParam(p)) return undefined;
  const array = /\[(\d+)\]$/.exec(p.type);
  if (array) {
    const element = {
      ...p,
      type: p.type.slice(0, -array[0].length),
    } as AbiParameter;
    const size = headWords(element);
    const index = Math.floor(word / size);
    return leafOf(element, word - index * size, [...path, BigInt(index)]);
  }
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return leafIn(components, word, path);
  }
  return { path, type: p.type };
}

/**
 * The read of a one-word value checked for its declared type: `nav` over
 * `base` (whose resolved bytes encode `retTypes`) along `path`. `raw`
 * reads the same word without the check; it is recorded for
 * {@link uncheckedWord} when the type's valid words are one interval.
 */
export function checkedWordParam(
  core: Address,
  base: InputParam,
  retTypes: string,
  path: readonly bigint[],
  type: string,
  raw: InputParam,
): InputParam {
  const param = staticCallParam(core, encodeNav(base, retTypes, path));
  registerUnchecked(param, raw, type);
  return param;
}

/** Record `raw` as the unchecked read behind the checked `param`, when the
 *  valid words of `type` are one interval. */
export function registerUnchecked(
  param: InputParam,
  raw: InputParam,
  type: string,
): void {
  const max = wordRange(type)?.max;
  if (max !== undefined) recordUnchecked(param, raw, max);
}

export { uncheckedWord, wordRange } from "./unchecked-words";
