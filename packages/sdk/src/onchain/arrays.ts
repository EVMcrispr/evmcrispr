/**
 * Word-array argument plumbing shared by the on-chain array faces
 * (@includes!, @all!, @map!, @merkle.verify!, …): validating that a call
 * argument resolves an array of single-word elements, and bridging its
 * envelope into the word-payload bytes the Operators word-array
 * vocabulary consumes.
 */
import type { AbiParameter, Hex } from "viem";
import { ErrorException } from "../errors";
import type { Node } from "../types";
import { NodeType } from "../types";
import {
  chainArgWithLens,
  constBigInt,
  constOperand,
  lenParam,
  lensedDataOperand,
} from "./compile";
import { compileOnchainHelper, isBangHelperNode } from "./dispatch";
import type { InputParam } from "./erc8211";
import { toWord } from "./erc8211";
import { arrayWordsParam } from "./recipes";
import type { CompileCtx, Operand } from "./types";

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
): Promise<{
  payload: InputParam;
  elemType: string;
  lanes?: readonly AbiParameter[];
}> {
  if (node && isBangHelperNode(node)) {
    const o: Operand = await compileOnchainHelper(ctx, node);
    if (o.kind !== "call" || o.cat !== "Bytes") {
      throw new ErrorException(
        `@${helper} nested argument must be an on-chain array face resolving a words payload (e.g. @map!, @sort!)`,
      );
    }
    if (!o.collection)
      throw new ErrorException(
        `@${helper} nested result has no array element type`,
      );
    if (
      o.collection.lanes &&
      !["keys!", "values!", "unzip!", "lookup!"].includes(helper)
    )
      throw new ErrorException(
        `@${helper} requires scalar elements; this collection contains typed pairs`,
      );
    const elemType = o.collection.element.type;
    if (!WORD_ELEMENT.test(elemType))
      throw new ErrorException(
        `@${helper} needs single-word elements, got ${elemType}`,
      );
    if (o.collection.transport === "words")
      return { payload: o.param, elemType, lanes: o.collection.lanes };
    const count = staticCallParam(
      ctx.core,
      encodeNav(o.param, `(${elemType}[])`, [0n, -(1n << 255n)]),
    );
    return { payload: arrayWordsParam(ctx, o.param, count), elemType };
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

/** A canonical typed array, shared by generic collection producers/consumers. */
export interface TypedArrayArg {
  param: InputParam;
  element: AbiParameter;
  words?: InputParam;
}
export async function typedArrayArg(
  ctx: CompileCtx,
  node: Node | undefined,
  helper: string,
): Promise<TypedArrayArg> {
  if (node && isBangHelperNode(node)) {
    const operand = await compileOnchainHelper(ctx, node);
    if (operand.kind !== "call" || !operand.collection)
      throw new ErrorException(`@${helper} needs a typed collection result`);
    let { element } = operand.collection;
    const { transport, lanes } = operand.collection;
    if (lanes) element = { type: "tuple", components: lanes };
    if (transport === "abi") return { param: operand.param, element };
    // Word payload and ABI array differ only in their length word.
    let count = wordCountParam(ctx, operand.param);
    if (lanes)
      count = wordOpParam(
        ctx,
        "div",
        false,
        count,
        rawParam(toWord(BigInt(lanes.length))),
      );
    const raw = staticCallParam(
      ctx.core,
      encodeNav(operand.param, "(bytes)", [0n, PAYLOAD_STEP]),
    );
    const param = unwrapBytesParam(
      ctx,
      concatParam(ctx, [
        toWord(32n),
        canonicalBytesParam(ctx, count),
        canonicalBytesParam(ctx, raw),
      ]),
    );
    return { param, element, ...(!lanes ? { words: operand.param } : {}) };
  }
  if (!node || node.type !== NodeType.CallExpression)
    throw new ErrorException(
      `@${helper} expects a live array call or typed collection helper`,
    );
  const arg = await chainArgWithLens(ctx, helper, node);
  if (!arg.path && arg.outputs.length !== 1)
    throw new ErrorException(
      `@${helper} needs a single array return; select one with a lens`,
    );
  const type = arg.terminal ?? arg.outputs[0];
  if (!type?.type.endsWith("[]"))
    throw new ErrorException(`@${helper} needs a dynamic array`);
  const element = { ...type, type: type.type.slice(0, -2) } as AbiParameter;
  return {
    param: lensedDataOperand(ctx, arg),
    element,
    ...(WORD_ELEMENT.test(element.type)
      ? { words: wordsPayload(ctx, arg, arg.path ?? [0]) }
      : {}),
  };
}
export function arrayValuesParam(
  ctx: CompileCtx,
  array: TypedArrayArg,
): InputParam {
  return collectionReadParam(ctx, "unpackArray", [
    { kind: "value", value: formatParamType(array.element) },
    canonicalArgSpec(
      ctx,
      { type: "bytes" },
      canonicalBytesParam(ctx, array.param),
    ),
  ]);
}
export function packedArrayOperand(
  ctx: CompileCtx,
  values: InputParam,
  element: AbiParameter,
): Operand {
  const packed = collectionReadParam(ctx, "packArray", [
    { kind: "value", value: formatParamType(element) },
    canonicalArgSpec(ctx, { type: "bytes[]" }, values),
  ]);
  return {
    kind: "call",
    param: unwrapBytesParam(ctx, packed),
    cat: "Bytes",
    collection: { element, transport: "abi" },
    abiType: { ...element, type: `${element.type}[]` } as AbiParameter,
  };
}

import {
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  unwrapBytesParam,
} from "./collections";
import { formatParamType, wordOpParam } from "./compile";
import { encodeNav, PAYLOAD_STEP } from "./core";
import { rawParam, staticCallParam } from "./erc8211";
import { concatParam, wordCountParam } from "./recipes";
