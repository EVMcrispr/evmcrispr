import type { Address, Hex } from "viem";
import { byteLenParamOf, opReadParam, wordOpParam } from "./compile";
import { encodePick } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import {
  bytesPayloadParam,
  bytesTail,
  envelopeLenParam,
  mergeSegments,
  type Slot,
  spliceLayout,
  wordPiece,
  wordsPayloadParam,
} from "./layout";
import { OP_SELECTORS } from "./operators";
import type { Category, CompileCtx, Operand } from "./types";

export {
  bytesPayloadParam,
  bytesTail,
  envelopeLenParam,
  type LiveSlot,
  MAX_LIVE_SLOTS,
  mergeSegments,
  type Piece,
  type Slot,
  spliceLayout,
  wordPiece,
  wordsPayloadParam,
} from "./layout";

const wordSpan = (v: bigint): string => toWord(v).slice(2);
const byteLen = (payload: Hex): number => (payload.length - 2) / 2;

/** A `[len][w0][w1]…` uint256[] tail as a literal hex span (no 0x). */
function wordsArrayTail(words: readonly bigint[]): string {
  let out = wordSpan(BigInt(words.length));
  for (const w of words) out += wordSpan(w);
  return out;
}

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
  needle: BytesPart,
  occurrence: bigint,
): InputParam {
  const { offsets, tail } = spliceLayout(ctx, toSlots(ctx, [s, needle]), 96);
  return opReadParam(
    ctx,
    OP_SELECTORS.indexOf,
    mergeSegments([
      wordPiece(offsets[0]), // offset_s
      wordPiece(offsets[1]), // offset_needle
      wordSpan(occurrence),
      ...tail,
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
  needle: BytesPart,
): InputParam {
  return wordOpParam(
    ctx,
    "lt",
    false,
    indexOfParam(ctx, s, needle, 0n),
    byteLenParamOf(ctx, s),
  );
}

/** The element count of a live aligned payload: `div(byteLen(s), 32)`.
 *  The word operators measure length in BYTES, so the count a word-index
 *  sentinel is compared against has to be derived. */
export function wordCountParam(ctx: CompileCtx, s: InputParam): InputParam {
  return wordOpParam(
    ctx,
    "div",
    false,
    byteLenParamOf(ctx, s),
    rawParam(toWord(32n)),
  );
}

/**
 * `includesWord(s, w)` := lt(wordIndexOf(s, w), wordCount(s)) — the
 * word-array twin of {@link includesParam}, and the only form that
 * accepts a LIVE element: `wordIndexOf` takes its needle as a spliceable
 * argument, where the fold recipe bakes it into the lambda template.
 * The not-found sentinel is the word count itself, so any hit is
 * strictly smaller.
 *
 * `s` is referenced TWICE and therefore RESOLVES twice, source call
 * included: an operand expression is a tree with no way to name a
 * subterm. That is why the constant-element path keeps the single-read
 * fold instead of routing through here.
 */
export function includesWordParam(
  ctx: CompileCtx,
  s: InputParam,
  w: bigint | InputParam,
): InputParam {
  return wordOpParam(
    ctx,
    "lt",
    false,
    wordIndexOfParam(ctx, s, w),
    wordCountParam(ctx, s),
  );
}

/**
 * A bounded fold over a LIVE payload (`foldWords`/`foldBytes`): heads are
 * [offset_s][target][offset_template = 224][accOffset][offset_elemOffsets]
 * [init][exit], the template tail sits at 224, the `elemOffsets` array
 * follows it, and the runtime envelope of `s` is spliced last with
 * offset_s skipping its leading 0x20 word. The lambda target is the
 * Operators contract for a template built from its own vocabulary, or the
 * core for a composed `read(...)` template. Pass a one-element
 * `elemOffsets` for the pre-C single-window shape.
 */
export function foldParam(
  ctx: CompileCtx,
  kind: "foldWords" | "foldBytes",
  s: InputParam,
  target: Address,
  template: Hex,
  accOffset: bigint,
  elemOffsets: readonly bigint[],
  init: bigint,
  exit: number,
): InputParam {
  const templateTail = bytesTail(template);
  const offsetsTail = wordsArrayTail(elemOffsets);
  const offsetsAt = 224 + templateTail.length / 2;
  const envelopeAt = offsetsAt + offsetsTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS[kind],
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(BigInt(target)), // lambda target
      wordSpan(224n), // offset_template
      wordSpan(accOffset),
      wordSpan(BigInt(offsetsAt)), // offset_elemOffsets
      wordSpan(init),
      wordSpan(BigInt(exit)),
      templateTail,
      offsetsTail,
      s,
    ]),
  );
}

/**
 * The character-class test: a native `charset(s, mask)` call. The bytes
 * arg is FIRST, so the head is [offset_s][mask] and the live string
 * envelope splices LAST — offset_s points at the payload+32 (skipping the
 * envelope's leading 0x20 word, the same trick every other bytes recipe
 * uses). `mask` is a composition-time constant built from the charset
 * spec. This replaces the old foldBytes(bitSet, All) recipe with a single
 * on-chain loop; foldBytes stays the general form for other per-byte
 * predicates.
 */
export function charsetParam(
  ctx: CompileCtx,
  s: InputParam,
  mask: bigint,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.charset,
    mergeSegments([
      wordSpan(96n), // offset_s: envelope at 64, skip its 0x20 word (64 + 32)
      wordSpan(mask), // the character-class bitmap constant
      s, // string envelope, spliced last
    ]),
  );
}

/** `sumWords(s)` over a live word payload — the native checked sum of the
 *  payload's 32-byte words (the fixed-operation form of the
 *  foldWords(add) recipe), spliced as the single `bytes` argument like
 *  {@link byteLenParamOf}. */
export function sumWordsParam(ctx: CompileCtx, s: InputParam): InputParam {
  return opReadParam(ctx, OP_SELECTORS.sumWords, [s]);
}

/**
 * `mapWords`/`filterWords` over a LIVE payload (identical signatures, so
 * they share one layout): heads are [offset_s][target]
 * [offset_template = 128][offset_elemOffsets], the template tail at 128,
 * the `elemOffsets` array after it, and the runtime envelope of `s`
 * spliced last with the +32 offset trick. Pass a one-element
 * `elemOffsets` for the pre-C single-window shape.
 */
function applyWordsParam(
  ctx: CompileCtx,
  kind: "mapWords" | "filterWords",
  s: InputParam,
  target: Address,
  template: Hex,
  elemOffsets: readonly bigint[],
): InputParam {
  const templateTail = bytesTail(template);
  const offsetsTail = wordsArrayTail(elemOffsets);
  const offsetsAt = 128 + templateTail.length / 2;
  const envelopeAt = offsetsAt + offsetsTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS[kind],
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(BigInt(target)), // lambda target
      wordSpan(128n), // offset_template
      wordSpan(BigInt(offsetsAt)), // offset_elemOffsets
      templateTail,
      offsetsTail,
      s,
    ]),
  );
}

/** `mapWords` over a LIVE payload (see {@link applyWordsParam}). */
export function mapWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  target: Address,
  template: Hex,
  elemOffsets: readonly bigint[],
): InputParam {
  return applyWordsParam(ctx, "mapWords", s, target, template, elemOffsets);
}

/** `filterWords` over a LIVE payload — the kept-elements sibling of
 *  {@link mapWordsParam}, byte-identical layout (only the selector
 *  differs: the lambda word decides keep/drop instead of replacing). */
export function filterWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  target: Address,
  template: Hex,
  elemOffsets: readonly bigint[],
): InputParam {
  return applyWordsParam(ctx, "filterWords", s, target, template, elemOffsets);
}

/** `iotaWords(n)` with a live count: calldata is the selector plus the
 *  resolved count word — the index generator 0, 1, …, n-1 that pairs with
 *  zipWords for enumerations. */
export function iotaWordsParam(
  ctx: CompileCtx,
  n: bigint | InputParam,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.iotaWords,
    mergeSegments([wordPiece(n)]),
  );
}

/** `wordIndexOf(s, w)` with a live payload: heads are [offset_s = 96][w]
 *  (the needle a literal word or a live word param), the envelope spliced
 *  at 64 with the +32 trick. Returns the WORD COUNT as the not-found
 *  sentinel, so a following word-index read reverts on a miss. */
export function wordIndexOfParam(
  ctx: CompileCtx,
  s: InputParam,
  w: bigint | InputParam,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.wordIndexOf,
    mergeSegments([
      wordSpan(96n), // offset_s skips the 0x20 word at 64
      wordPiece(w),
      s,
    ]),
  );
}

/**
 * The word at a LIVE index of a words payload, as a single word operand:
 * `slice(s, mul(index, 32), 32)` re-frames the element as a one-word
 * bytes value and a core `pick` of word 2 unwraps it from its envelope
 * ([0x20][32][word]). An out-of-range index reverts the slice with
 * SliceOutOfBounds — the miss path of wordIndexOf's count sentinel.
 */
export function wordAtParam(
  ctx: CompileCtx,
  s: InputParam,
  index: bigint | InputParam,
): InputParam {
  const start =
    typeof index === "bigint"
      ? rawParam(toWord(index * 32n))
      : wordOpParam(ctx, "mul", false, index, rawParam(toWord(32n)));
  return staticCallParam(
    ctx.core,
    encodePick(sliceParam(ctx, s, start, 32n), 2n),
  );
}

/**
 * `zipWords(iotaWords(n), s)` — the enumeration recipe: pairs each element
 * with its index as an interleaved [index, element] word-pair payload (the
 * on-chain record representation). BOTH sides are live, which the
 * fixed-offset zip layout cannot host — so offset_b is itself a LIVE word:
 * the iota envelope (64 + 32n bytes) splices at 64 with offset_a = 96, and
 * offset_b = add(mul(n, 32), 160) points past it at the payload envelope
 * (spliced last, +32 trick included in the 160).
 */
export function enumerateParam(
  ctx: CompileCtx,
  s: InputParam,
  n: InputParam,
): InputParam {
  const len32 = wordOpParam(ctx, "mul", false, n, rawParam(toWord(32n)));
  const offsetB = wordOpParam(ctx, "add", false, len32, rawParam(toWord(160n)));
  return opReadParam(
    ctx,
    OP_SELECTORS.zipWords,
    mergeSegments([
      wordSpan(96n), // offset_a: the iota envelope at 64, 0x20 word skipped
      offsetB, // live offset_b = 160 + 32n
      iotaWordsParam(ctx, n), // iota envelope [0x20][32n][0 1 …]
      s, // payload envelope, spliced last
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
 * `replace(s, needle, repl)` with a live `s`: heads are
 * [offset_s][offset_needle = 96][offset_repl], the constant needle and
 * replacement tails follow at 96, and the runtime envelope of `s` is
 * spliced last with the +32 offset trick.
 */
export function replaceParam(
  ctx: CompileCtx,
  s: InputParam,
  needle: BytesPart,
  repl: BytesPart,
): InputParam {
  const { offsets, tail } = spliceLayout(
    ctx,
    toSlots(ctx, [s, needle, repl]),
    96,
  );
  return opReadParam(
    ctx,
    OP_SELECTORS.replace,
    mergeSegments([
      wordPiece(offsets[0]), // offset_s
      wordPiece(offsets[1]), // offset_needle
      wordPiece(offsets[2]), // offset_repl
      ...tail,
    ]),
  );
}

/** `unzipWords(s, which)` with a live payload: heads are
 *  [offset_s = 96][which], the envelope spliced at 64. */
export function unzipParam(
  ctx: CompileCtx,
  s: InputParam,
  which: bigint,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.unzipWords,
    mergeSegments([
      wordSpan(96n), // offset_s skips the 0x20 word at 64
      wordSpan(which),
      s,
    ]),
  );
}

/**
 * A P1 single-read operand: a direct staticcall with build-time calldata.
 * `pickWord` unwraps one word of a multi-value return through a core
 * `pick`, so the operand stays a clean single word for the word machine
 * (constraints only inspect the FIRST word, but nested splices carry the
 * full returndata).
 */
export function directReadOperand(
  ctx: CompileCtx,
  target: Address,
  data: Hex,
  cat: Category,
  pickWord?: bigint,
): Operand {
  const param = staticCallParam(target, data);
  if (pickWord === undefined) return { kind: "call", param, cat };
  return {
    kind: "call",
    param: staticCallParam(ctx.core, encodePick(param, pickWord)),
    cat,
  };
}

/**
 * SHA-256 of a live string/bytes operand's DECODED payload, via a
 * `rawCall` to the SHA-256 precompile (0x02): heads are
 * [target = 2][offset_data = 96], the resolved envelope spliced with the
 * +32 offset trick so the precompile hashes the payload itself. rawCall
 * returns the returndata as a bytes VALUE, so the 32-byte digest is
 * unwrapped from its envelope with a core `pick` of word 2.
 */
export function sha256Param(ctx: CompileCtx, s: InputParam): InputParam {
  const raw = opReadParam(
    ctx,
    OP_SELECTORS.rawCall,
    mergeSegments([
      wordSpan(2n), // target: the SHA-256 precompile
      wordSpan(96n), // offset_data skips the 0x20 word at 64
      s,
    ]),
  );
  return staticCallParam(ctx.core, encodePick(raw, 2n));
}

/** A part of a spliced `bytes[]`: a literal payload, or ONE live operand
 *  resolving to a bytes envelope. */
export type BytesPart = Hex | InputParam | { param: InputParam; aligned: true };

const _isLivePart = (p: BytesPart): p is Exclude<BytesPart, Hex> =>
  typeof p !== "string";

/** A parts list as layout slots. A bare live param is sized as a
 *  bytes/string envelope; `aligned` opts into the cheaper word-payload
 *  sizing and must only be used where the payload really is a whole
 *  number of words, since an over-claim shifts every later offset. */
function toSlots(ctx: CompileCtx, parts: readonly BytesPart[]): Slot[] {
  return parts.map((p) => {
    if (typeof p === "string") return { tail: bytesTail(p) };
    if ("aligned" in p) {
      return { param: p.param, payload: wordsPayloadParam(ctx, p.param) };
    }
    return { param: p, payload: bytesPayloadParam(ctx, p) };
  });
}

/**
 * `concat(bytes[] parts)` with at most one LIVE part: heads are
 * [0x20][N] followed by N element offsets (relative to the elements head
 * area at 64), the constant tails in order, and the live envelope spliced
 * last — its element offset points into the splice with the +32 trick,
 * so the live part may sit at ANY logical index.
 */
export function concatParam(
  ctx: CompileCtx,
  parts: readonly BytesPart[],
): InputParam {
  // A `bytes[]`: element offsets are RELATIVE to the elements head area
  // at 64, and the tail area starts past the N offset words.
  const base = 64;
  const { offsets, tail } = spliceLayout(
    ctx,
    toSlots(ctx, parts),
    base + 32 * parts.length,
    base,
  );
  return opReadParam(
    ctx,
    OP_SELECTORS.concat,
    mergeSegments([
      wordSpan(32n), // offset_parts
      wordSpan(BigInt(parts.length)),
      ...offsets.map(wordPiece),
      ...tail,
    ]),
  );
}

/**
 * `zipWords(a, b)` with at most one live payload: heads are
 * [offset_a][offset_b], the constant payload's tail at 64 and the live
 * envelope spliced last with the +32 trick (both constant packs both
 * tails in order).
 */
export function zipParam(
  ctx: CompileCtx,
  a: BytesPart,
  b: BytesPart,
): InputParam {
  // Two plain `bytes` args, so offsets are ABSOLUTE and the tail area
  // starts past the two head words.
  const { offsets, tail } = spliceLayout(ctx, toSlots(ctx, [a, b]), 64);
  return opReadParam(
    ctx,
    OP_SELECTORS.zipWords,
    mergeSegments([wordPiece(offsets[0]), wordPiece(offsets[1]), ...tail]),
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
  delimiter: BytesPart,
  index: bigint,
): InputParam {
  // A constant delimiter contributes its length as a literal; a live one
  // has to read it from its own envelope, which is the only difference
  // between the two paths.
  const dlen: bigint | InputParam =
    typeof delimiter === "string"
      ? BigInt(byteLen(delimiter))
      : envelopeLenParam(
          ctx,
          "aligned" in delimiter ? delimiter.param : delimiter,
        );
  const add = (a: InputParam, b: bigint | InputParam): InputParam =>
    wordOpParam(
      ctx,
      "add",
      false,
      a,
      typeof b === "bigint" ? rawParam(toWord(b)) : b,
    );
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
