import type { Hex } from "viem";
import { ErrorException } from "../errors";
import { encodeOpRead, encodePick } from "./core";
import type { InputParam } from "./erc8211";
import { rawParam, staticCallParam, toWord } from "./erc8211";
import { opSelector } from "./operators";
import type { CompileCtx } from "./types";

/**
 * Calldata layout primitives: how a call's ABI head/tail structure is
 * built when some of its arguments only resolve at judge time.
 *
 * The encoder owns the layout — head offsets are explicit words — so a
 * runtime-sized operand (a resolved string/bytes/array envelope) needs
 * either to sit where nothing follows it, or to have every later offset
 * computed on-chain from its length. {@link spliceLayout} does the
 * second, which is what lets one call carry more than one live value.
 */

/** An Operators word op over two resolved operands, as a core read. */
function wordOp(
  ctx: CompileCtx,
  fn: string,
  a: InputParam,
  b: InputParam,
): InputParam {
  return staticCallParam(
    ctx.core,
    encodeOpRead(ctx.operators, opSelector(fn, false), [a, b]),
  );
}

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
  return wordOp(
    ctx,
    "bitAnd",
    wordOp(ctx, "add", envelopeLenParam(ctx, env), rawParam(toWord(31n))),
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
      ? wordOp(ctx, "add", grown, rawParam(toWord(here)))
      : here;
    if (j === lives.length - 1) break;
    at += 64; // this envelope's [0x20][len]
    const p = lives[j].s.payload as bigint | InputParam;
    if (typeof p === "bigint") {
      at += Number(p);
      continue;
    }
    grown = grown ? wordOp(ctx, "add", grown, p) : p;
  }

  return { offsets, tail: [...constTails, ...lives.map((l) => l.s.param)] };
}
