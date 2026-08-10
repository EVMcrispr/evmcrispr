import type { Address, Hex } from "viem";
import { ErrorException } from "../errors";
import { byteLenParamOf, opReadParam, wordOpParam } from "./compile";
import { encodePick } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import { OP_SELECTORS } from "./operators";
import type { Category, CompileCtx, Operand } from "./types";

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
 * [offset_template = 128][elemOffset], the template tail at 128 and the
 * runtime envelope of `s` spliced last with the +32 offset trick.
 */
function applyWordsParam(
  ctx: CompileCtx,
  kind: "mapWords" | "filterWords",
  s: InputParam,
  template: Hex,
  elemOffset: bigint,
): InputParam {
  const templateTail = bytesTail(template);
  const envelopeAt = 128 + templateTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS[kind],
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

/** `mapWords` over a LIVE payload (see {@link applyWordsParam}). */
export function mapWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  template: Hex,
  elemOffset: bigint,
): InputParam {
  return applyWordsParam(ctx, "mapWords", s, template, elemOffset);
}

/** `filterWords` over a LIVE payload — the kept-elements sibling of
 *  {@link mapWordsParam}, byte-identical layout (only the selector
 *  differs: the lambda word decides keep/drop instead of replacing). */
export function filterWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  template: Hex,
  elemOffset: bigint,
): InputParam {
  return applyWordsParam(ctx, "filterWords", s, template, elemOffset);
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
  needle: Hex,
  repl: Hex,
): InputParam {
  const needleTail = bytesTail(needle);
  const replAt = 96 + needleTail.length / 2;
  const replTail = bytesTail(repl);
  const envelopeAt = replAt + replTail.length / 2;
  return opReadParam(
    ctx,
    OP_SELECTORS.replace,
    mergeSegments([
      wordSpan(BigInt(envelopeAt + 32)), // offset_s skips the 0x20 word
      wordSpan(96n), // offset_needle
      wordSpan(BigInt(replAt)), // offset_repl
      needleTail,
      replTail,
      s,
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

/**
 * How many live envelopes one call may splice.
 *
 * The binding cost is not the extra reads, it is that an operand
 * expression is a tree with no way to name a subterm: every offset after
 * the first live part references the LENGTH of each earlier one, so live
 * source `j` is resolved once as its envelope plus once more inside each
 * later offset. That is L(L-1)/2 redundant resolutions, source calls
 * included, and the encoded operand blob grows with the square too.
 *
 * The cap is a hard build-time error rather than a warning because the
 * failure it prevents is silent: an assertion is judged inside an
 * `eth_call`, so an over-budget expression runs out of gas and reverts,
 * and a reverted judge is indistinguishable from an assertion that
 * legitimately failed.
 */
export const MAX_LIVE_SLOTS = 4;

/** A dynamic argument of a calldata layout: a pre-encoded constant tail
 *  span (no 0x), or a live envelope. `payload` is the PADDED payload size
 *  of the resolved value — everything after its [0x20][len] head words.
 *  It is required for every live slot except the last, since only the
 *  slots that follow one need to know how far it pushes them. */
export interface LiveSlot {
  param: InputParam;
  payload?: bigint | InputParam;
}
export type Slot = { tail: string } | LiveSlot;

const isLiveSlot = (s: Slot): s is LiveSlot => "param" in s;

/** The `len` word of a resolved envelope [0x20][len][payload], as a core
 *  `pick` of word 1. One core read, where `byteLen` would cost a core
 *  read plus an Operators hop. Byte length for bytes/string; ELEMENT
 *  COUNT for a `T[]`, which is why sizing has to be type-directed. */
export function envelopeLenParam(ctx: CompileCtx, env: InputParam): InputParam {
  return staticCallParam(ctx.core, encodePick(env, 1n));
}

/** ceil32 of a bytes/string envelope's length: its padded payload size.
 *  `bitAnd(add(len, 31), ~31)` beats `mul(div(len, 32), 32)` by a read. */
export function bytesPayloadParam(
  ctx: CompileCtx,
  env: InputParam,
): InputParam {
  return wordOpParam(
    ctx,
    "bitAnd",
    false,
    wordOpParam(
      ctx,
      "add",
      false,
      envelopeLenParam(ctx, env),
      rawParam(toWord(31n)),
    ),
    rawParam(toWord((1n << 256n) - 32n)),
  );
}

/** A payload that is already a whole number of words (every word-array
 *  face produces one), so its length word IS its padded size. */
export const wordsPayloadParam = envelopeLenParam;

/**
 * Lay out N dynamic arguments, ANY number of them live.
 *
 * Constant tails are hoisted ahead of every live envelope so their
 * offsets stay build-time literals; the live envelopes then follow in
 * slot order. The running position is split in two — `at` carries the
 * build-time part (each envelope's own [0x20][len] head words) and
 * `grown` the runtime part (their padded payloads) — which keeps every
 * offset to at most ONE live `add`:
 *
 *   offset_k = add(payload_1 ⊕ … ⊕ payload_{k-1}, <one literal>)
 *
 * `headBytes` is where the tail area starts (past every head word of the
 * enclosing call); `base` is what offsets are measured from — 0 for a
 * normal ABI call, 64 for the element head area of a `bytes[]`.
 *
 * The returned `tail` is already in emission order. Splice it verbatim:
 * `mergeSegments` accepts live pieces anywhere, so a caller that rebuilt
 * the list in a different order would produce valid-looking calldata
 * whose offsets point at the wrong envelope.
 */
export function spliceLayout(
  ctx: CompileCtx,
  slots: readonly Slot[],
  headBytes: number,
  base = 0,
): { offsets: (bigint | InputParam)[]; tail: Piece[] } {
  const lives = slots.flatMap((s, i) => (isLiveSlot(s) ? [{ s, i }] : []));
  if (lives.length > MAX_LIVE_SLOTS) {
    throw new ErrorException(
      `at most ${MAX_LIVE_SLOTS} live values can be spliced into one call, got ${lives.length} — each one past the first is re-resolved by every later offset, so the cost grows with the square. Fold the constant parts together, or split the expression`,
    );
  }
  for (const { s } of lives.slice(0, -1)) {
    if (s.payload === undefined) {
      throw new ErrorException(
        "a live value whose runtime size the compiler cannot derive must be spliced last, since nothing after it would have a computable offset",
      );
    }
  }

  const offsets = new Array<bigint | InputParam>(slots.length);
  const constTails: string[] = [];

  let at = headBytes;
  slots.forEach((s, i) => {
    if (isLiveSlot(s)) return;
    offsets[i] = BigInt(at - base);
    constTails.push(s.tail);
    at += s.tail.length / 2;
  });

  let grown: InputParam | undefined;
  for (let j = 0; j < lives.length; j++) {
    // +32 skips this envelope's own 0x20 word, the trick that lets the
    // decoder read the length word directly.
    const here = BigInt(at + 32 - base);
    offsets[lives[j].i] = grown
      ? wordOpParam(ctx, "add", false, grown, rawParam(toWord(here)))
      : here;
    if (j === lives.length - 1) break;
    at += 64; // this envelope's [0x20][len]
    const p = lives[j].s.payload as bigint | InputParam;
    if (typeof p === "bigint") {
      at += Number(p);
      continue;
    }
    grown = grown ? wordOpParam(ctx, "add", false, grown, p) : p;
  }

  return { offsets, tail: [...constTails, ...lives.map((l) => l.s.param)] };
}

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
