import type { AbiFunction, Address, Hex } from "viem";
import { parseAbiItem } from "viem";
import { COLLECTIONS_ADDRESS } from "./addresses";
import { unwrapBytesParam } from "./collections";
import { byteLenParamOf, opReadParam, wordOpParam } from "./compile";
import { type ArgSpec, buildCall, callParam } from "./construct";
import { encodePick, encodeRead, gatherParam } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import { GraphBuilder, graphParam } from "./graph";
import {
  bytesTail,
  envelopeLenParam,
  mergeSegments,
  type Piece,
  wordPiece,
} from "./layout";
import { OP_SELECTORS } from "./operators";
import type { Category, CompileCtx, Operand } from "./types";

export {
  bytesPayloadParam,
  bytesTail,
  envelopeLenParam,
  type LiveSlot,
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
 * Operations vocabulary through the core's `read`. The encoder owns the
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
  return partsCallParam(ctx, ctx.operators, "indexOf(bytes,bytes,int256)", [
    s,
    needle,
    occurrence,
  ]);
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

/** Literal substring membership, including the empty needle. */
export function includesParam(
  ctx: CompileCtx,
  s: InputParam,
  needle: BytesPart,
): InputParam {
  return partsCallParam(ctx, ctx.operators, "contains(bytes,bytes)", [
    s,
    needle,
  ]);
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
 * Operations contract for a template built from its own vocabulary, or the
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
 * on-chain record representation). BOTH sides are runtime-sized lives, so
 * this is `get`'s shape: the core resolves each envelope once in its own
 * frame and encodes the pair, where the fixed-offset layout would have had
 * to compute the second offset from the first payload's length on-chain
 * (and re-resolve it to do so).
 */
export function enumerateParam(
  ctx: CompileCtx,
  s: InputParam,
  n: InputParam,
): InputParam {
  return zipParam(ctx, iotaWordsParam(ctx, n), s);
}

/**
 * The word payload of a live ARRAY-envelope operand as a bytes value —
 * the bridge from a `T[]` return (envelope `[0x20][count][words…]`, its
 * length word an ELEMENT count) into the word-array operators (foldWords,
 * mapWords, sortWords, …) whose `bytes` payloads measure length in BYTES.
 *
 * Validates one canonical array and shares that resolved envelope through the graph.
 */
export function arrayWordsParam(
  ctx: CompileCtx,
  envelope: InputParam,
  elementType: string,
): InputParam {
  const graph = new GraphBuilder(ctx);
  const array = graph.resolve(envelope, `${elementType}[]`);
  const result = graph.operation("sliceRange", [
    graph.wrap(array),
    graph.literal({ type: "int256" }, 64n),
    graph.literal({ type: "int256" }, (1n << 255n) - 1n),
  ]);
  return graphParam(ctx, graph, result);
}

/**
 * `slice(data, 4, byteLen(data) - 4)` over a live calldata value: the args
 * tuple of an ABI call as a bytes value, the 4-byte selector sliced off so
 * every word realigns. The layout is {@link arrayWordsParam}'s re-framing
 * with a byte-granular start: the synthesized length word covers the whole
 * envelope and `start = 68` skips its two head words plus the selector.
 * The graph shares one canonical bytes source between length and slice.
 */
export function calldataArgsParam(
  ctx: CompileCtx,
  envelope: InputParam,
): InputParam {
  const graph = new GraphBuilder(ctx);
  const bytes = graph.resolve(envelope, "bytes");
  const len = graph.operation("byteLen", [bytes]);
  const argsLen = graph.operation("sub", [
    len,
    graph.literal({ type: "uint256" }, 4n),
  ]);
  const result = graph.operation("slice", [
    bytes,
    graph.literal({ type: "uint256" }, 4n),
    argsLen,
  ]);
  return graphParam(ctx, graph, result);
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
  return partsCallParam(ctx, ctx.operators, "replace(bytes,bytes,bytes)", [
    s,
    needle,
    repl,
  ]);
}

/** Deduplicate a live words payload. The offset skips its retained bytes-envelope head. */
export function uniqueWordsParam(
  ctx: CompileCtx,
  s: InputParam,
  ordered: boolean,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.uniqueWords,
    mergeSegments([wordSpan(96n), wordSpan(ordered ? 1n : 0n), s]),
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

/**
 * A live WORD as a bytes envelope of its bytes [start, start+len), via
 * one `slice` whose data argument is a synthesized [32][word] envelope:
 * heads are [offset_data = 96][start][len], then the literal length word
 * and the raw word itself. This is how a word-cat operand (a balance, a
 * picked return word) becomes a part of a byte concatenation — full
 * width with the defaults, or narrowed to its type's packed width
 * (address = (12, 20), uintN = (32 - N/8, N/8), bytesN = (0, N)).
 */
export function wordPartParam(
  ctx: CompileCtx,
  w: InputParam,
  start = 0n,
  len = 32n,
): InputParam {
  return opReadParam(
    ctx,
    OP_SELECTORS.slice,
    mergeSegments([
      wordSpan(96n), // offset_data: the synthesized envelope below
      wordSpan(start),
      wordSpan(len),
      wordSpan(32n), // the envelope's length word
      w,
    ]),
  );
}

/**
 * A judge-time-constructed staticcall with literal heads and ONE live
 * bytes argument spliced last: calldata is the selector, the head
 * pieces, then the resolved envelope with the +32 offset trick (a head
 * offset pointing at the live argument must already account for it).
 * The {@link sha256Param} shape, generalized to any target.
 */
export function oneLiveBytesCallParam(
  ctx: CompileCtx,
  target: InputParam,
  selector: Hex,
  heads: readonly Piece[],
  live: InputParam,
): InputParam {
  return staticCallParam(
    ctx.core,
    encodeRead(target, selector, mergeSegments([...heads, live])),
  );
}

/** A part of a spliced `bytes[]`: a literal payload, or ONE live operand
 *  resolving to a bytes envelope. `aligned` claims a whole-word payload;
 *  `size` claims an EXACT payload byte length known at composition time
 *  (a sliced word part), which keeps every later offset a literal. */
export type BytesPart =
  | Hex
  | InputParam
  | { param: InputParam; aligned: true }
  | { param: InputParam; size: number };

/** The live operand behind a non-literal part, whatever its sizing. */
export const livePartParam = (p: Exclude<BytesPart, Hex>): InputParam =>
  "param" in p ? p.param : p;

/** Concatenate byte parts with an empty delimiter, resolving each part
 *  once: the core's `gather` takes every part's raw payload as one
 *  element of the `bytes[]`, the only live argument of `concat`, so any
 *  number of live parts costs one resolution each. */
export function concatParam(
  ctx: CompileCtx,
  parts: readonly BytesPart[],
): InputParam {
  return partsCallParam(ctx, ctx.operators, "concat(bytes[],bytes)", [
    gatherParam(
      ctx.core,
      parts.map((p) =>
        typeof p === "string"
          ? rawParam(p)
          : unwrapBytesParam(ctx, livePartParam(p)),
      ),
    ),
    "0x",
  ]);
}

/**
 * `zipWords(a, b)` over any mix of constant and live payloads: one live
 * payload splices last on `read`; two runtime-sized lives go through
 * `get`, each resolved once in the core's frame.
 */
export function zipParam(
  ctx: CompileCtx,
  a: BytesPart,
  b: BytesPart,
): InputParam {
  return partsCallParam(
    ctx,
    ctx.collections ?? COLLECTIONS_ADDRESS,
    "zipWords(bytes,bytes)",
    [a, b],
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
      : envelopeLenParam(ctx, livePartParam(delimiter));
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

/** ceil32 of an exact payload byte length. */
const padded = (size: number): bigint =>
  BigInt(size + ((32 - (size % 32)) % 32));

/**
 * A call over byte parts and words on the host `chooseHost` picks: a
 * constant part is a build-time value (its tail hoisted to a literal
 * offset on `read`), a live part a dynamic live sized by its claim (an
 * exact `size` keeps every later offset literal), a bigint a word value.
 * One runtime-sized live spliced last stays on `read`; two go to `get`.
 */
function partsCallParam(
  ctx: CompileCtx,
  target: Address,
  signature: string,
  parts: readonly (BytesPart | bigint)[],
): InputParam {
  const fn = parseAbiItem(`function ${signature}`) as AbiFunction;
  const specs: ArgSpec[] = parts.map((p) => {
    if (typeof p === "bigint" || typeof p === "string") {
      return { kind: "value", value: p as never };
    }
    const spec: ArgSpec = { kind: "dyn", param: livePartParam(p) };
    if ("size" in p) spec.payload = padded(p.size);
    return spec;
  });
  return callParam(
    ctx,
    rawParam(toWord(BigInt(target))),
    buildCall(ctx, fn, specs),
  );
}
