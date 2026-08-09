/**
 * Shared plumbing of the lang word-array on-chain faces (@includes!,
 * @all!, @any!, @reduce!, …): validating that a call argument resolves an
 * array of single-word elements, and bridging its envelope into the
 * word-payload bytes the Operators folds consume.
 */
import type { Node } from "@evmcrispr/sdk";
import { ErrorException, NodeType } from "@evmcrispr/sdk";
import type { CompileCtx, InputParam } from "@evmcrispr/sdk/onchain";
import {
  arrayWordsParam,
  chainArgWithLens,
  compileOnchainHelper,
  constBigInt,
  constOperand,
  isBangHelperNode,
  lenParam,
  lensedDataOperand,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type { AbiParameter, Hex } from "viem";

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

/**
 * Compile a word-array ARGUMENT of an on-chain array face: either a `::`
 * call (or chain) returning an array of single-word elements, or a
 * nested on-chain array face (`@map!`, `@sort!`, …) whose bytes result is
 * already a words payload — the faces compose by nesting.
 */
export async function wordsArg(
  ctx: CompileCtx,
  node: Node | undefined,
  helper: string,
): Promise<{ payload: InputParam; elemType: string }> {
  if (node && isBangHelperNode(node)) {
    const o = await compileOnchainHelper(ctx, node);
    if (o.kind !== "call" || o.cat !== "Bytes") {
      throw new ErrorException(
        `@${helper} nested argument must be an on-chain array face resolving a words payload (e.g. @map!, @sort!)`,
      );
    }
    return { payload: o.param, elemType: "uint256" };
  }
  if (!node || node.type !== NodeType.CallExpression) {
    throw new ErrorException(
      `@${helper} expects a \`::\` call expression or a nested on-chain array face, e.g. @${helper}($safe::getOwners() …)`,
    );
  }
  const arg = await chainArgWithLens(ctx, helper, node);
  const { path, elemType } = wordArrayPath(arg, helper);
  return { payload: wordsPayload(ctx, arg, path), elemType };
}

/** Interpret a build-time constant array literal into its packed word
 *  payload (one 32-byte word per element). */
export async function constWordsPayload(
  ctx: CompileCtx,
  node: Node,
  helper: string,
): Promise<Hex> {
  const value = await ctx.interpreters.interpretNode(node);
  if (!Array.isArray(value)) {
    throw new ErrorException(
      `@${helper} constant parts must be array literals, got ${typeof value}`,
    );
  }
  let payload = "0x" as string;
  for (const element of value) {
    const o = constOperand(element);
    if (o.kind !== "const") {
      throw new ErrorException(
        `@${helper} constant parts must contain build-time words`,
      );
    }
    payload += toWord(constBigInt(o)).slice(2);
  }
  return payload as Hex;
}
