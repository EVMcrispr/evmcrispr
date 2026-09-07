/**
 * Typed array normalization shared by on-chain helpers. Literals, live
 * fixed/dynamic arrays, and nested helpers retain their ABI element types.
 * Word arrays keep their packed payload; validated generic pipelines can
 * pass canonical element encodings directly between collection operations.
 */
import type { AbiParameter, Hex } from "viem";
import { encodeAbiParameters, isAddress, isHex } from "viem";
import { ErrorException } from "../errors";
import type { CallExpressionNode, Node } from "../types";
import { NodeType } from "../types";
import { encodeParams } from "../utils/encoders";
import { Num } from "../utils/Num";
import {
  compileCallValue,
  constBigInt,
  constOperand,
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
  _path: readonly number[],
): InputParam {
  return arrayWordsParam(
    ctx,
    lensedDataOperand(ctx, arg),
    (arg.terminal ?? arg.outputs[0]).type.slice(0, -2),
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
    return { payload: arrayWordsParam(ctx, o.param, elemType), elemType };
  }
  const array = await typedArrayArg(ctx, node, helper);
  if (!array.words)
    throw new ErrorException(
      `@${helper} needs single-word elements, got ${formatParamType(array.element)}`,
    );
  return { payload: array.words, elemType: array.element.type };
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

// A shortcut is tied to the exact canonical array operand, not merely its
// element metadata. Replacing or constraining that operand must keep the
// normal pack/unpack path so the shortcut cannot bypass a guard. The encoded
// call data is immutable; comparing its fields also catches in-place changes.
const validatedValues = new WeakMap<
  InputParam,
  {
    values: InputParam;
    type: string;
    paramType: InputParam["paramType"];
    fetcherType: InputParam["fetcherType"];
    paramData: Hex;
  }
>();

function copyParam(param: InputParam): InputParam {
  return { ...param, constraints: param.constraints.map((c) => ({ ...c })) };
}
export async function typedArrayArg(
  ctx: CompileCtx,
  node: Node | undefined,
  helper: string,
): Promise<TypedArrayArg> {
  if (node && isBangHelperNode(node)) {
    return typedArrayFromOperand(
      ctx,
      await compileOnchainHelper(ctx, node),
      helper,
    );
  }
  if (!node) throw new ErrorException(`@${helper} expects an array`);
  if (node.type !== NodeType.CallExpression) {
    const value = await ctx.interpreters.interpretNode(node);
    if (!Array.isArray(value))
      throw new ErrorException(`@${helper} expects an array`);
    return literalArrayArg(value, constantElement(value), helper);
  }
  const { param, terminal } = await compileCallValue(
    ctx,
    node as CallExpressionNode,
  );
  return typedArrayFromValue(ctx, param, terminal, helper);
}

/** Normalize an already compiled collection without compiling its source again. */
export function typedArrayFromOperand(
  ctx: CompileCtx,
  operand: Operand,
  helper: string,
): TypedArrayArg {
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

/** Normalize a canonical fixed/dynamic array returned by a compiled call. */
export function typedArrayFromValue(
  ctx: CompileCtx,
  param: InputParam,
  terminal: AbiParameter,
  helper: string,
): TypedArrayArg {
  const suffix = terminal.type.match(/\[(\d*)\]$/);
  if (!suffix) {
    const hint =
      terminal.type === "string" || terminal.type === "bytes"
        ? " — string/bytes values have their own str./bytes. faces"
        : "";
    throw new ErrorException(
      `@${helper} needs an array, got ${terminal.type}${hint}`,
    );
  }
  const element = {
    ...terminal,
    type: terminal.type.slice(0, -suffix[0].length),
  } as AbiParameter;
  let normalized = param;
  if (suffix[1]) {
    const wrapped = canonicalBytesParam(ctx, param);
    const tail = isDynamicParam(element)
      ? sliceParam(
          ctx,
          wrapped,
          32n,
          wordOpParam(
            ctx,
            "sub",
            false,
            envelopeLenParam(ctx, wrapped),
            rawParam(toWord(32n)),
          ),
        )
      : wrapped;
    normalized = unwrapBytesParam(
      ctx,
      concatParam(ctx, [toWord(32n), toWord(BigInt(suffix[1])), tail]),
    );
  }
  return {
    param: normalized,
    element,
    ...(WORD_ELEMENT.test(element.type)
      ? { words: arrayWordsParam(ctx, normalized, element.type) }
      : {}),
  };
}

/** Infer a homogeneous literal's ABI type; empty arrays default to uint256[]. */
export function constantAbiType(value: unknown): AbiParameter {
  if (
    value instanceof Num ||
    typeof value === "bigint" ||
    typeof value === "number"
  )
    return { type: Num(value as never).lt(Num(0)) ? "int256" : "uint256" };
  if (typeof value === "boolean") return { type: "bool" };
  if (typeof value === "string")
    return {
      type: isAddress(value) ? "address" : isHex(value) ? "bytes" : "string",
    };
  if (Array.isArray(value)) {
    const element = constantElement(value);
    return { ...element, type: `${element.type}[]` } as AbiParameter;
  }
  if (value && typeof value === "object")
    return {
      type: "tuple",
      components: Object.entries(value).map(([name, v]) => ({
        ...constantAbiType(v),
        name,
      })),
    };
  throw new ErrorException(
    "Cannot infer a concrete ABI type for this array element",
  );
}

function constantElement(values: unknown[]): AbiParameter {
  if (values.length === 0) return { type: "uint256" };
  // Infer nested arrays together so empty rows and mixed-sign rows use the
  // same element type as their nonempty siblings.
  if (values.every(Array.isArray)) {
    const element = constantElement(values.flat());
    return { ...element, type: `${element.type}[]` } as AbiParameter;
  }
  const types = values.map(constantAbiType);
  if (types.every((t) => /^u?int256$/.test(t.type)))
    return {
      type: types.some((t) => t.type === "int256") ? "int256" : "uint256",
    };
  const first = types[0];
  if (types.some((t) => formatParamType(t) !== formatParamType(first)))
    throw new ErrorException(
      "Array elements must have one ABI-compatible type",
    );
  return first;
}
function literalArrayArg(
  value: unknown[],
  element: AbiParameter,
  helper: string,
): TypedArrayArg {
  return {
    element,
    param: rawParam(
      encodeParams(
        [{ ...element, type: `${element.type}[]` }],
        [value] as never,
        helper,
      ),
    ),
    ...(WORD_ELEMENT.test(element.type)
      ? {
          words: rawParam(
            encodeAbiParameters(
              [{ type: "bytes" }],
              [
                `0x${value.map((v) => encodeParams([element], [v] as never, helper).slice(2)).join("")}`,
              ],
            ),
          ),
        }
      : {}),
  };
}

/** Resolve each part once; literal parts inherit a live part's element type. */
export async function typedArrayParts(
  ctx: CompileCtx,
  nodes: readonly Node[],
  helper: string,
): Promise<TypedArrayArg[]> {
  const parts = await Promise.all(
    nodes.map(async (node) => {
      if (node.type === NodeType.CallExpression || isBangHelperNode(node))
        return { array: await typedArrayArg(ctx, node, helper) };
      const value = await ctx.interpreters.interpretNode(node);
      if (!Array.isArray(value))
        throw new ErrorException(`@${helper} expects array parts`);
      return { value };
    }),
  );
  const element =
    parts.find((p) => p.array)?.array?.element ??
    constantElement(parts.flatMap((p) => p.value ?? []));
  return parts.map(
    (p) => p.array ?? literalArrayArg(p.value!, element, helper),
  );
}

/** Concatenate homogeneous typed arrays, retaining the word path when possible. */
export function concatArrayOperand(
  ctx: CompileCtx,
  arrays: readonly TypedArrayArg[],
  helper: string,
): Operand {
  const element = arrays[0]?.element ?? { type: "uint256" };
  const type = formatParamType(element);
  if (arrays.some((a) => formatParamType(a.element) !== type))
    throw new ErrorException(
      `@${helper} requires matching array element types`,
    );
  if (arrays.every((a) => a.words))
    return {
      kind: "call",
      param: concatParam(
        ctx,
        arrays.map((a) => ({ param: a.words!, aligned: true })),
      ),
      cat: "Bytes",
      collection: { element, transport: "words" },
    };
  const nested = unwrapBytesParam(
    ctx,
    collectionReadParam(ctx, "packArray", [
      { kind: "value", value: "bytes[]" },
      canonicalArgSpec(
        ctx,
        { type: "bytes[]" },
        encodeValuesParam(
          ctx,
          arrays.map((a) => canonicalBytesParam(ctx, arrayValuesParam(ctx, a))),
        ),
      ),
    ]),
  );
  return packedArrayOperand(
    ctx,
    collectionReadParam(ctx, "flattenValues", [
      { kind: "value", value: type },
      canonicalArgSpec(ctx, { type: "bytes[][]" }, nested),
    ]),
    element,
    { validated: true },
  );
}

function validatedArrayValues(array: TypedArrayArg): InputParam | undefined {
  const view = validatedValues.get(array.param);
  if (
    view &&
    array.param.constraints.length === 0 &&
    view.paramType === array.param.paramType &&
    view.fetcherType === array.param.fetcherType &&
    view.paramData === array.param.paramData &&
    view.type === formatParamType(array.element)
  )
    return copyParam(view.values);
}

/** Count a collection without packing a validated values view just to read its length. */
export function arrayLengthParam(
  ctx: CompileCtx,
  array: TypedArrayArg,
): InputParam {
  const values = validatedArrayValues(array);
  return staticCallParam(
    ctx.core,
    encodeNav(
      values ?? array.param,
      values ? "(bytes[])" : `(${formatParamType(array.element)}[])`,
      [0n, -(1n << 255n)],
    ),
  );
}

export function arrayValuesParam(
  ctx: CompileCtx,
  array: TypedArrayArg,
): InputParam {
  const values = validatedArrayValues(array);
  if (values) return values;
  return collectionReadParam(ctx, "unpackArray", [
    { kind: "value", value: formatParamType(array.element) },
    canonicalArgSpec(
      ctx,
      { type: "bytes" },
      canonicalBytesParam(ctx, array.param),
    ),
  ]);
}
/** Materialize canonical ABI at the boundary. Set validated only if the values
 * producer validates every returned element against the supplied ABI type;
 * downstream collection consumers may then omit the intermediate pack/unpack. */
export function packedArrayOperand(
  ctx: CompileCtx,
  values: InputParam,
  element: AbiParameter,
  options: { validated?: boolean } = {},
): Operand {
  const packed = collectionReadParam(ctx, "packArray", [
    { kind: "value", value: formatParamType(element) },
    canonicalArgSpec(ctx, { type: "bytes[]" }, values),
  ]);
  const param = unwrapBytesParam(ctx, packed);
  // Opt in only when the producer validates EVERY returned element as this
  // type (e.g. Collections mapValues/filterValues). Arbitrary bytes[] still
  // need packArray's validation even if a downstream consumer exits early.
  if (options.validated)
    validatedValues.set(param, {
      values: copyParam(values),
      type: formatParamType(element),
      paramType: param.paramType,
      fetcherType: param.fetcherType,
      paramData: param.paramData,
    });
  return {
    kind: "call",
    param,
    cat: "Bytes",
    collection: { element, transport: "abi" },
    abiType: { ...element, type: `${element.type}[]` } as AbiParameter,
  };
}

import {
  canonicalArgSpec,
  canonicalBytesParam,
  collectionReadParam,
  encodeValuesParam,
  unwrapBytesParam,
} from "./collections";
import { formatParamType, wordOpParam } from "./compile";
import { isDynamicParam } from "./construct";
import { encodeNav, PAYLOAD_STEP } from "./core";
import { rawParam, staticCallParam } from "./erc8211";
import {
  concatParam,
  envelopeLenParam,
  sliceParam,
  wordCountParam,
} from "./recipes";
