/**
 * Word-array argument plumbing of the lang on-chain faces — now shared
 * across modules from `@evmcrispr/sdk/onchain` (the crypto merkle face
 * folds the same payloads); re-exported here for the lang helpers.
 */
export {
  type CallArrayArg,
  constWordsPayload,
  wordArrayPath,
  wordsArg,
  wordsPayload,
} from "@evmcrispr/sdk/onchain";

import type { Node } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { BytesPart, CompileCtx } from "@evmcrispr/sdk/onchain";
import { compileOperand } from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";

/**
 * A string ARGUMENT of one of the string faces — the needle, the
 * replacement, the delimiter — which may be a build-time constant or a
 * live call resolving one.
 *
 * Returns the constant text alongside the compiled part when it is known,
 * because the guards that only make sense for a constant (an empty needle
 * matches everywhere, so the assertion could never fail) have to be
 * written against the text rather than the operand.
 */
export async function stringArg(
  ctx: CompileCtx,
  node: Node,
  helper: string,
  label: string,
): Promise<{ part: BytesPart; text?: string }> {
  const o = await compileOperand(ctx, node);
  if (o.kind === "call") {
    if (o.cat !== "String" && o.cat !== "Bytes") {
      throw new ErrorException(
        `@${helper} ${label} must resolve a string or bytes value, got a ${o.cat} value`,
      );
    }
    return { part: o.param };
  }
  if (typeof o.value !== "string") {
    throw new ErrorException(`@${helper} ${label} must be a string`);
  }
  return { part: stringToHex(o.value), text: o.value };
}
