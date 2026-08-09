import type { Hex } from "viem";
import { byteLenParamOf, opReadParam, wordOpParam } from "./compile";
import type { InputParam } from "./erc8211";
import { rawParam, toWord } from "./erc8211";
import { FOLD_EXIT, OP_SELECTORS } from "./operators";
import type { CompileCtx } from "./types";

/**
 * Bytes-operation recipes: how the string helpers compile onto the plain
 * Operators vocabulary through the core's `read`. The encoder owns the
 * calldata layout — ABI offsets are explicit, so a runtime-length operand
 * (a resolved string/bytes envelope) is spliced LAST at a known byte
 * position P, and its head offset points at P + 32, skipping the
 * envelope's leading 0x20 word (calldata decoding follows offsets and
 * tolerates the gap word). Fixed-length words and pre-encoded constant
 * tails come first, so every other offset is known at composition time.
 */

/** A calldata span: literal hex (without 0x) or a live word/envelope. */
export type Piece = string | InputParam;

const span = (v: Hex): string => v.slice(2);
const wordSpan = (v: bigint): string => span(toWord(v));

/** Byte length of a hex payload. */
const byteLen = (payload: Hex): number => (payload.length - 2) / 2;

/** A [len][payload padded to 32] bytes tail, as a literal span. */
export function bytesTail(payload: Hex): string {
  const len = byteLen(payload);
  const padded = span(payload) + "00".repeat((32 - (len % 32)) % 32);
  return wordSpan(BigInt(len)) + padded;
}

/** Merge adjacent literal spans into RAW_BYTES segments, keeping live
 *  params as their own segments (mirrors construct.ts). */
export function mergeSegments(pieces: Piece[]): InputParam[] {
  const segments: InputParam[] = [];
  let acc = "";
  for (const piece of pieces) {
    if (typeof piece === "string") {
      acc += piece;
      continue;
    }
    if (acc.length > 0) {
      segments.push(rawParam(`0x${acc}`));
      acc = "";
    }
    segments.push(piece);
  }
  if (acc.length > 0) {
    segments.push(rawParam(`0x${acc}`));
  }
  return segments;
}

/** A word argument piece: a literal word span, or a live word param. */
export const wordPiece = (v: bigint | InputParam): Piece =>
  typeof v === "bigint" ? wordSpan(v) : v;

/**
 * `indexOf(s, needle, occurrence)` with a live haystack: heads are
 * [offset_s][offset_needle = 96][occurrence], the constant needle tail
 * sits at 96, and the runtime envelope of `s` is spliced last at P with
 * offset_s = P + 32. `occurrence` is a build-time ordinal (0, 1, 2, …
 * from the start; -1, -2, … from the end), two's-complement encoded.
 */
export function indexOfParam(
  ctx: CompileCtx,
  s: InputParam,
  needle: Hex,
  occurrence: bigint,
): InputParam {
  const needleTail = bytesTail(needle);
  const envelopeAt = 96 + needleTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS.indexOf,
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(96n), // offset_needle
      wordSpan(occurrence),
      needleTail,
      s,
    ]),
  );
}

/**
 * `slice(data, start, len)` with a live `data`: heads are
 * [offset_data = 128][start][len], the envelope spliced at 96.
 */
export function sliceParam(
  ctx: CompileCtx,
  s: InputParam,
  start: bigint | InputParam,
  len: bigint | InputParam,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.slice,
    mergeSegments([
      wordSpan(128n), // offset_data skips the 0x20 word at 96
      wordPiece(start),
      wordPiece(len),
      s,
    ]),
  );
}

/** `includes(s, needle)` := lt(indexOf(s, needle, 0), byteLen(s)) — the
 *  not-found sentinel is byteLen(s), so any match position is smaller. */
export function includesParam(
  ctx: CompileCtx,
  s: InputParam,
  needle: Hex,
): InputParam {
  return wordOpParam(
    ctx,
    "lt",
    false,
    indexOfParam(ctx, s, needle, 0n),
    byteLenParamOf(ctx, s),
  );
}

/**
 * A bounded fold over a LIVE payload (`foldWords`/`foldBytes`): heads are
 * [offset_s][target][offset_template = 224][accOffset][elemOffset][init]
 * [exit], the template tail sits at 224 and the runtime envelope of `s`
 * is spliced last with offset_s skipping its leading 0x20 word. The
 * lambda target is always the Operators contract itself — templates are
 * built from its own vocabulary.
 */
export function foldParam(
  ctx: CompileCtx,
  kind: "foldWords" | "foldBytes",
  s: InputParam,
  template: Hex,
  accOffset: bigint,
  elemOffset: bigint,
  init: bigint,
  exit: number,
): InputParam {
  const templateTail = bytesTail(template);
  const envelopeAt = 224 + templateTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS[kind],
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(BigInt(ctx.operators)), // lambda target
      wordSpan(224n), // offset_template
      wordSpan(accOffset),
      wordSpan(elemOffset),
      wordSpan(init),
      wordSpan(BigInt(exit)),
      templateTail,
      s,
    ]),
  );
}

/**
 * The character-class test: foldBytes over the live string with a
 * `bitSet(mask, byte)` template lambda, FoldExit.All and init 1 — the
 * accumulator stays 1 exactly while every byte's bit is set in the mask.
 * Both fold windows share the element offset (36): bitSet ignores the
 * accumulator and the element wins on overlap.
 */
export function charsetParam(
  ctx: CompileCtx,
  s: InputParam,
  mask: bigint,
): InputParam {
  // bitSet(mask, <element>) — 4 + 32 + 32 = 68 template bytes.
  const template: Hex = `0x${span(OP_SELECTORS.bitSet)}${wordSpan(mask)}${wordSpan(0n)}`;
  return foldParam(ctx, "foldBytes", s, template, 36n, 36n, 1n, FOLD_EXIT.All);
}

/**
 * `mapWords` over a LIVE payload: heads are [offset_s][target]
 * [offset_template = 128][elemOffset], the template tail at 128 and the
 * runtime envelope of `s` spliced last with the +32 offset trick.
 */
export function mapWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  template: Hex,
  elemOffset: bigint,
): InputParam {
  const templateTail = bytesTail(template);
  const envelopeAt = 128 + templateTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS.mapWords,
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(BigInt(ctx.operators)), // lambda target
      wordSpan(128n), // offset_template
      wordSpan(elemOffset),
      templateTail,
      s,
    ]),
  );
}

/**
 * The word payload of a live ARRAY-envelope operand as a bytes value —
 * the bridge from a `T[]` return (envelope `[0x20][count][words…]`, its
 * length word an ELEMENT count) into the word-array operators (foldWords,
 * mapWords, sortWords, …) whose `bytes` payloads measure length in BYTES.
 *
 * Compiles to `slice(data, 64, 32 * count)` where `data` is the raw array
 * envelope re-framed as bytes: heads are [offset_data = 96][start = 64]
 * [len = mul(count, 32)], and at 96 a LIVE synthesized length word
 * `add(mul(count, 32), 64)` is spliced immediately before the raw
 * envelope — so the decoder sees a bytes value whose payload is the whole
 * envelope, and the slice skips its two head words.
 */
export function arrayWordsParam(
  ctx: CompileCtx,
  envelope: InputParam,
  count: InputParam,
): InputParam {
  const len32 = wordOpParam(ctx, "mul", false, count, rawParam(toWord(32n)));
  const total = wordOpParam(ctx, "add", false, len32, rawParam(toWord(64n)));
  return opReadParam(
    ctx,
    OP_SELECTORS.slice,
    mergeSegments([
      wordSpan(96n), // offset_data: the re-framed envelope at 96
      wordSpan(64n), // start: skip the [0x20][count] head words
      len32, // len = 32 * count (live word)
      total, // synthesized bytes length word (live)
      envelope, // the raw array envelope [0x20][count][words…]
    ]),
  );
}

/**
 * Split-and-select: segment boundaries are indexOf occurrence ordinals
 * and the segment is a slice between them — two indexOf reads per
 * segment, whatever the index. Segment k >= 0 spans
 * [indexOf(s, d, k-1) + dlen, indexOf(s, d, k)) (0 for k == 0; the
 * not-found sentinel byteLen(s) ends the trailing segment for free), and
 * segment -k spans [indexOf(s, d, -k) + dlen, indexOf(s, d, -k+1))
 * (byteLen(s) for k == 1).
 */
export function splitParam(
  ctx: CompileCtx,
  s: InputParam,
  delimiter: Hex,
  index: bigint,
): InputParam {
  const dlen = BigInt(byteLen(delimiter));
  const add = (a: InputParam, b: bigint): InputParam =>
    wordOpParam(ctx, "add", false, a, rawParam(toWord(b)));
  const sub = (a: InputParam, b: InputParam): InputParam =>
    wordOpParam(ctx, "sub", false, a, b);

  if (index === 0n) {
    return sliceParam(ctx, s, 0n, indexOfParam(ctx, s, delimiter, 0n));
  }
  if (index === -1n) {
    // Trailing segment: its end is byteLen(s) itself, no second indexOf.
    const start = add(indexOfParam(ctx, s, delimiter, -1n), dlen);
    return sliceParam(ctx, s, start, sub(byteLenParamOf(ctx, s), start));
  }
  // The segment sits between two adjacent delimiter occurrences: k-1 and
  // k counting from the start, k and k+1 counting from the end.
  const startOcc = index > 0n ? index - 1n : index;
  const endOcc = index > 0n ? index : index + 1n;
  const start = add(indexOfParam(ctx, s, delimiter, startOcc), dlen);
  const end = indexOfParam(ctx, s, delimiter, endOcc);
  return sliceParam(ctx, s, start, sub(end, start));
}
