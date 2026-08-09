import type { Param } from "@evmcrispr/sdk";
import { ErrorException, encodeParams } from "@evmcrispr/sdk";
import type { AbiFunction, AbiParameter, Hex } from "viem";
import { toFunctionSelector } from "viem";
import type { InputParam } from "./erc8211";
import { rawParam, toWord } from "./erc8211";

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

/** One argument of a constructed call. */
export type ArgSpec =
  | { kind: "value"; value: Param }
  | { kind: "word"; param: InputParam }
  | { kind: "dyn"; param: InputParam };

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
function headWords(p: AbiParameter): number {
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
 * contract), and a dynamic live argument must be the last argument (its
 * envelope is appended by the judge, so nothing may follow it) — its head
 * offset skips the envelope's own offset word, landing the decoder on the
 * length word (ABI decoding tolerates the loose prefix).
 */
export function buildCallSegments(
  fnAbi: AbiFunction,
  specs: ArgSpec[],
): ReadCall {
  const inputs = fnAbi.inputs;
  if (specs.length !== inputs.length) {
    throw new ErrorException(
      `${fnAbi.name} expects ${inputs.length} argument(s), got ${specs.length}`,
    );
  }
  if (specs.filter((s) => s.kind === "dyn").length > 1) {
    throw new ErrorException(
      "only one dynamic-typed nested call argument is supported per call",
    );
  }
  const headSizes = inputs.map((p) => headWords(p) * 32);
  const headTotal = headSizes.reduce((a, b) => a + b, 0);

  // Two streams of literal hex spans (no 0x) interleaved with live params;
  // a dynamic live argument is the last argument, so every literal tail
  // span before it has a build-time size.
  const heads: (string | InputParam)[] = [];
  const tails: (string | InputParam)[] = [];
  let tailLen = 0; // literal tail bytes so far
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
      if (i !== specs.length - 1) {
        throw new ErrorException(
          `a dynamic-typed live call argument must be the last argument of ${fnAbi.name} — the judge appends its runtime-sized value, so nothing can follow it`,
        );
      }
      // Point the head past the envelope's own offset word.
      heads.push(toWord(BigInt(headTotal + tailLen + 32)).slice(2));
      tails.push(spec.param);
      continue;
    }
    const encoded = encodeParams(
      [input],
      [spec.value as Param],
      `${fnAbi.name} argument ${i}`,
    ).slice(2);
    if (isDynamicParam(input)) {
      heads.push(toWord(BigInt(headTotal + tailLen)).slice(2));
      const tail = encoded.slice(64); // strip the single-value offset word
      tails.push(tail);
      tailLen += tail.length / 2;
    } else {
      heads.push(encoded);
    }
  }

  // Merge adjacent literal spans, materialize them as RAW_BYTES segments.
  const segments: InputParam[] = [];
  let span = "";
  for (const piece of [...heads, ...tails]) {
    if (typeof piece === "string") {
      span += piece;
      continue;
    }
    if (span.length > 0) {
      segments.push(rawParam(`0x${span}`));
      span = "";
    }
    segments.push(piece);
  }
  if (span.length > 0) {
    segments.push(rawParam(`0x${span}`));
  }
  return { selector: toFunctionSelector(fnAbi), segments };
}
