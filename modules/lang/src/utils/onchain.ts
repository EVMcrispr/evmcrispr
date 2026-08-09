/**
 * Shared plumbing of the lang word-array on-chain faces (@includes!,
 * @all!, @any!, @reduce!, …): validating that a call argument resolves an
 * array of single-word elements, and bridging its envelope into the
 * word-payload bytes the Operators folds consume.
 */
import { ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx, InputParam } from "@evmcrispr/sdk/onchain";
import {
  arrayWordsParam,
  lenParam,
  lensedDataOperand,
} from "@evmcrispr/sdk/onchain";
import type { AbiParameter } from "viem";

const WORD_ELEMENT = /^(u?int\d*|address|bool|bytes32)$/;

export interface CallArrayArg {
  param: InputParam;
  outputs: readonly AbiParameter[];
  path?: number[];
  terminal?: AbiParameter;
}

/** Validate a {@link CallArrayArg} selects a dynamic array of single-word
 *  elements and resolve the nav path to it (default [0]). */
export function wordArrayPath(
  arg: CallArrayArg,
  helper: string,
): { path: number[]; elemType: string } {
  if (arg.path === undefined && arg.outputs.length !== 1) {
    throw new ErrorException(
      `@${helper} needs a single array return value; select one with a lens`,
    );
  }
  const t = arg.path ? arg.terminal?.type : arg.outputs[0]?.type;
  if (!t || !/\[\]$/.test(t)) {
    const hint =
      t === "string" || t === "bytes"
        ? " — string/bytes values have their own str./bytes. faces"
        : "";
    throw new ErrorException(
      `@${helper} needs an array of single-word elements, got ${t ?? "none"}${hint}`,
    );
  }
  const elemType = t.slice(0, -2);
  if (!WORD_ELEMENT.test(elemType)) {
    throw new ErrorException(
      `@${helper} works on arrays of single-word elements; ${t} elements do not fit a fold word`,
    );
  }
  return { path: arg.path ?? [0], elemType };
}

/** The array's word payload as live bytes: the (possibly lensed) envelope
 *  re-framed through `arrayWordsParam` with its element count read via a
 *  LEN-sentinel nav. */
export function wordsPayload(
  ctx: CompileCtx,
  arg: CallArrayArg,
  path: readonly number[],
): InputParam {
  return arrayWordsParam(
    ctx,
    lensedDataOperand(ctx, arg),
    lenParam(ctx, arg.param, arg.outputs, path),
  );
}
