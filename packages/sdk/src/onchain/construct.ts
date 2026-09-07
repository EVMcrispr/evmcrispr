import type { AbiFunction, AbiParameter, Hex } from "viem";
import { toFunctionSelector } from "viem";
import { ErrorException } from "../errors";
import type { Param } from "../utils/encoders";
import { encodeParams } from "../utils/encoders";
import { encodeGet, encodeRead } from "./core";
import { type InputParam, rawParam, staticCallParam } from "./erc8211";
import { argumentDescriptor } from "./expressions";
import {
  mergeSegments,
  type Piece,
  type Slot,
  spliceLayout,
  wordPiece,
} from "./layout";
import type { CompileCtx } from "./types";

/**
 * Nested live call arguments compile to one of the core's two call
 * constructors, chosen per shape ({@link chooseHost}):
 *
 * - `read`: the enclosing call is expressed as calldata SEGMENTS — literal
 *   spans become RAW_BYTES params and each live argument stays its own
 *   fetcher param — and the judge concatenates the resolved segments after
 *   the selector at assertion time (ERC-8211 CALL_DATA routing). Every
 *   offset is a build-time literal: word-only calls, and calls with one
 *   runtime-sized live value spliced last, cost the least this way.
 * - `get`: each argument is a WHOLE canonical value the core resolves once
 *   and encodes in-frame under the call's argument tuple descriptor. The
 *   host for any call that would otherwise need a runtime offset (a
 *   runtime-sized live followed by another dynamic live): one resolution
 *   per argument instead of the quadratic offset splice.
 *
 * Both keep the core as the destination's `msg.sender`, and both are
 * ordinary composable operands: they nest inside chains, operator
 * expressions and other reads, and the judged value always flows through a
 * plain `assertParam`.
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
  | { kind: "encoded"; param: InputParam }
  | { kind: "dyn"; param: InputParam; payload?: bigint | InputParam };

/** A constructed call ready for `encodeRead`: the 4-byte selector and the
 *  calldata segments the judge concatenates after it. */
export interface ReadCall {
  selector: Hex;
  segments: InputParam[];
}

/** A constructed call on either core host: `read` over calldata segments,
 *  or `get` over whole canonical arguments and their tuple descriptor. */
export type CompiledCall =
  | { host: "read"; selector: Hex; segments: InputParam[] }
  | {
      host: "get";
      selector: Hex;
      argumentTypes: string;
      args: InputParam[];
    };

/** A dyn spec whose padded payload size is not a build-time literal. */
export const runtimeSized = (s: ArgSpec): boolean =>
  s.kind === "dyn" && typeof s.payload !== "bigint";

/**
 * Which core host a call takes: `get` when some runtime-sized dynamic
 * live is followed by another dynamic live (the only case that needs an
 * offset computed on-chain), else `read` with literal offsets. Pinned by
 * the contracts repo's ExpressionsGas.t.sol row A: at two live strings
 * `get` costs 32,440 gas against 51,474 for the offset splice (161,812 vs
 * 245,532 with costly sources), while one live string stays cheaper on
 * `read` (19,000 vs 20,217) and word-only calls too (14,718 vs 21,219).
 */
export function chooseHost(
  specs: readonly ArgSpec[],
  _inputs: readonly AbiParameter[],
): CompiledCall["host"] {
  for (let i = 0; i < specs.length; i++) {
    if (!runtimeSized(specs[i])) continue;
    // A constant dynamic tail is hoisted ahead of every live envelope by
    // spliceLayout and a word argument has a fixed head, so only another
    // LIVE dynamic argument forces an offset computed on-chain.
    if (specs.slice(i + 1).some((later) => later.kind === "dyn")) return "get";
  }
  return "read";
}

/** The arguments as WHOLE canonical values, one operand per parameter:
 *  what `get` and `gather` consume. A word param is that value already
 *  (the core checks its exact length), a dynamic live is its envelope, a
 *  build-time value is encoded whole. */
export function wholeArguments(
  specs: readonly ArgSpec[],
  inputs: readonly AbiParameter[],
  context: string,
): InputParam[] {
  return specs.map((spec, i) =>
    spec.kind === "value"
      ? rawParam(encodeParams([inputs[i]], [spec.value], `${context} ${i}`))
      : spec.param,
  );
}

/**
 * Compile a function call whose arguments may be live onto the host
 * {@link chooseHost} picks. The `read` form is byte-identical to
 * {@link buildCallSegments}; the `get` form carries each argument whole.
 */
export function buildCall(
  ctx: CompileCtx,
  fnAbi: AbiFunction,
  specs: ArgSpec[],
): CompiledCall {
  const inputs = fnAbi.inputs;
  if (specs.length !== inputs.length) {
    throw new ErrorException(
      `${fnAbi.name} expects ${inputs.length} argument(s), got ${specs.length}`,
    );
  }
  if (chooseHost(specs, inputs) === "get") {
    return {
      host: "get",
      selector: toFunctionSelector(fnAbi),
      argumentTypes: argumentDescriptor(inputs),
      args: wholeArguments(specs, inputs, `${fnAbi.name} argument`),
    };
  }
  const { selector, segments } = buildCallSegments(ctx, fnAbi, specs);
  return { host: "read", selector, segments };
}

/** The constructed call as an operand at the core, against `target` (a
 *  literal address word or a live chain prefix). */
export function callParam(
  ctx: CompileCtx,
  target: InputParam,
  call: CompiledCall,
): InputParam {
  return staticCallParam(
    ctx.core,
    call.host === "get"
      ? encodeGet(target, call.selector, call.argumentTypes, call.args)
      : encodeRead(target, call.selector, call.segments),
  );
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
 * Compile a function call whose arguments may be live into `read`
 * segments. The head/tail layout is computed at build time, so word
 * arguments must be single-word static parameters (their segment resolves
 * to exactly 32 bytes — every word-producing param the compiler emits
 * keeps that contract). Dynamic arguments go through {@link spliceLayout}:
 * constant tails are hoisted ahead of the live envelopes so their offsets
 * stay literal, and the one live envelope is spliced last with its head
 * offset skipping its own offset word, landing the decoder on the length
 * word (ABI decoding tolerates the loose prefix). A shape that would need
 * an offset computed on-chain belongs on `get` ({@link buildCall}); asked
 * for one, this throws.
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
    if (spec.kind === "encoded") {
      if (isDynamicParam(input))
        throw new ErrorException(
          "encoded static argument cannot have a dynamic ABI type",
        );
      heads.push(spec.param);
      continue;
    }
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

  // A runtime-sized live followed by another live would need an offset
  // computed on-chain: that shape is `get`'s. Checked here rather than in
  // spliceLayout so the message can name the parameter that caused it.
  for (let i = 0; i < specs.length; i++) {
    if (!runtimeSized(specs[i])) continue;
    const laterDyn = specs.findIndex((s, j) => j > i && s.kind === "dyn");
    if (laterDyn !== -1) {
      throw new ErrorException(
        `internal: parameter ${i} of ${fnAbi.name} is a runtime-sized live followed by another live dynamic argument, which needs a runtime offset; route through buildCall`,
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
