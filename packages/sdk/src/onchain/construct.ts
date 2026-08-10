import type { AbiFunction, AbiParameter, Hex } from "viem";
import { toFunctionSelector } from "viem";
import { ErrorException } from "../errors";
import type { Param } from "../utils/encoders";
import { encodeParams } from "../utils/encoders";
import type { InputParam } from "./erc8211";
import {
  mergeSegments,
  type Piece,
  type Slot,
  spliceLayout,
  wordPiece,
} from "./layout";
import type { CompileCtx } from "./types";

/**
 * Nested live call arguments compile to the core's `read` primitive: the
 * enclosing call is expressed as calldata SEGMENTS — literal spans become
 * RAW_BYTES params and each live argument stays its own fetcher param —
 * and the judge concatenates the resolved segments after the selector at
 * assertion time (ERC-8211 CALL_DATA routing). The call-with-live-args is
 * therefore an ordinary composable operand: it nests inside chains,
 * operator expressions and other reads, and the judged value always
 * flows through a plain `assertParam`.
 */

// ---------------------------------------------------------------------------
//  Argument specs
// ---------------------------------------------------------------------------

/** One argument of a constructed call. A `dyn` spec carries `payload`
 *  when the compiler can derive its resolved value's padded size — that
 *  is what lets a later argument's offset be computed from it. Without
 *  one it can only go last. */
export type ArgSpec =
  | { kind: "value"; value: Param }
  | { kind: "word"; param: InputParam }
  | { kind: "dyn"; param: InputParam; payload?: bigint | InputParam };

/** A constructed call ready for `encodeRead`: the 4-byte selector and the
 *  calldata segments the judge concatenates after it. */
export interface ReadCall {
  selector: Hex;
  segments: InputParam[];
}

/** Whether a parameter is ABI-dynamic (mirrors the core's shape rules). */
export function isDynamicParam(p: AbiParameter): boolean {
  const suffix = p.type.match(/\[(\d*)\]$/);
  if (suffix) {
    if (suffix[1] === "") return true;
    return isDynamicParam({
      ...p,
      type: p.type.slice(0, -suffix[0].length),
    } as AbiParameter);
  }
  if (p.type === "bytes" || p.type === "string") return true;
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return components.some(isDynamicParam);
  }
  return false;
}

/** The head footprint of a parameter in 32-byte words (1 for dynamic
 *  values — their head word is an offset). */
export function headWords(p: AbiParameter): number {
  if (isDynamicParam(p)) return 1;
  const suffix = p.type.match(/\[(\d+)\]$/);
  if (suffix) {
    return (
      Number(suffix[1]) *
      headWords({
        ...p,
        type: p.type.slice(0, -suffix[0].length),
      } as AbiParameter)
    );
  }
  if (p.type === "tuple") {
    const components =
      (p as { components?: readonly AbiParameter[] }).components ?? [];
    return components.reduce((sum, c) => sum + headWords(c), 0);
  }
  return 1;
}

const SINGLE_WORD_ABI = /^(u?int\d*|address|bool|bytes32)$/;

/**
 * Compile a function call whose arguments may be live into read segments.
 * The head/tail layout is computed at build time, so word arguments must be
 * single-word static parameters (their segment resolves to exactly 32
 * bytes — every word-producing param the compiler emits keeps that
 * contract). Dynamic arguments go through {@link spliceLayout}: constant
 * tails are hoisted ahead of the live envelopes so their offsets stay
 * literal, and each live envelope after the first gets an offset computed
 * on-chain from the earlier payloads' lengths. Every dynamic head offset
 * skips its envelope's own offset word, landing the decoder on the length
 * word (ABI decoding tolerates the loose prefix). Only a live value whose
 * size the compiler cannot derive still has to come last.
 */
export function buildCallSegments(
  ctx: CompileCtx,
  fnAbi: AbiFunction,
  specs: ArgSpec[],
): ReadCall {
  const inputs = fnAbi.inputs;
  if (specs.length !== inputs.length) {
    throw new ErrorException(
      `${fnAbi.name} expects ${inputs.length} argument(s), got ${specs.length}`,
    );
  }
  const headTotal = inputs.reduce((sum, p) => sum + headWords(p) * 32, 0);

  // Pass one: a head piece per argument, and the dynamic arguments
  // classified into layout slots. Constant tails are hoisted ahead of the
  // live envelopes by spliceLayout, so their offsets stay literal words.
  const heads: (string | InputParam)[] = [];
  const slots: Slot[] = [];
  const slotOfArg = new Map<number, number>();
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const input = inputs[i];
    if (spec.kind === "word") {
      if (!SINGLE_WORD_ABI.test(input.type)) {
        throw new ErrorException(
          `a live call argument must fill a single-word parameter (uint/int, address, bool, bytes32); parameter ${i} of ${fnAbi.name} is ${input.type}`,
        );
      }
      heads.push(spec.param);
      continue;
    }
    if (spec.kind === "dyn") {
      if (!isDynamicParam(input)) {
        throw new ErrorException(
          `a dynamic live argument needs a dynamic parameter type; parameter ${i} of ${fnAbi.name} is ${input.type}`,
        );
      }
      heads.push(""); // patched with its offset in pass two
      slotOfArg.set(i, slots.length);
      slots.push({ param: spec.param, payload: spec.payload });
      continue;
    }
    const encoded = encodeParams(
      [input],
      [spec.value as Param],
      `${fnAbi.name} argument ${i}`,
    ).slice(2);
    if (isDynamicParam(input)) {
      heads.push(""); // patched with its offset in pass two
      slotOfArg.set(i, slots.length);
      slots.push({ tail: encoded.slice(64) }); // strip the offset word
      continue;
    }
    heads.push(encoded);
  }

  // A live argument whose size the compiler cannot derive still has to be
  // last, since nothing after it could have a computable offset. Checked
  // here rather than in spliceLayout so the message can name the
  // parameter that caused it.
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (spec.kind !== "dyn" || spec.payload !== undefined) continue;
    const laterDyn = specs.findIndex(
      (s, j) => j > i && (s.kind === "dyn" || isDynamicParam(inputs[j])),
    );
    if (laterDyn !== -1) {
      throw new ErrorException(
        `the ${inputs[i].type} value nested at parameter ${i} of ${fnAbi.name} has no build-time-derivable runtime size, so it must be the last dynamic argument — nothing after it would have a computable offset`,
      );
    }
  }

  // Pass two: place the tails and patch each dynamic head with its offset.
  const { offsets, tail } = spliceLayout(ctx, slots, headTotal);
  const pieces: Piece[] = heads.map((h, i) => {
    const slot = slotOfArg.get(i);
    if (slot === undefined) return h;
    return wordPiece(offsets[slot]);
  });

  return {
    selector: toFunctionSelector(fnAbi),
    segments: mergeSegments([...pieces, ...tail]),
  };
}
