import type { CallExpressionNode, Node } from "@evmcrispr/sdk";
import { checkedInteger, checkedRange, ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx, InputParam, Operand } from "@evmcrispr/sdk/onchain";
import {
  arrayWordsParam,
  buildCall,
  CONSTRAINT_TYPE,
  CORE_ABI,
  callParam,
  canonicalArgSpec,
  canonicalBytesParam,
  categoryFromAbiType,
  compileCallValue,
  compileCheckedExpr,
  concatenateResolved,
  concatParam,
  constBigInt,
  encodeNav,
  envelopeLenParam,
  isDynamicParam,
  materializeWord,
  rawParam,
  sliceParam,
  staticCallParam,
  toWord,
  unwrapBytesParam,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { AbiFunction, AbiParameter } from "viem";

/** A checked signed index. Live expressions remain runtime reads. */
export async function indexParam(
  ctx: CompileCtx,
  node: Node,
): Promise<InputParam> {
  const value = await compileCheckedExpr(ctx, [node]);
  const param = materializeWord(ctx, value);
  const max = (1n << 255n) - 1n;
  if (value.kind === "const") {
    if (constBigInt(value) > max)
      throw new ErrorException("Array index must fit int256");
    return param;
  }
  return value.cat === "Uint"
    ? {
        ...param,
        constraints: [
          ...param.constraints,
          { constraintType: CONSTRAINT_TYPE.Lte, referenceData: toWord(max) },
        ],
      }
    : param;
}

/** Runtime nav path, with a fixed prefix and one live index. */
export function indexedNav(
  ctx: CompileCtx,
  source: InputParam,
  descriptor: string,
  prefix: readonly bigint[],
  index: InputParam,
): InputParam {
  if (index.fetcherType === 0 && index.constraints.length === 0) {
    const bits = BigInt(index.paramData);
    return staticCallParam(
      ctx.core,
      encodeNav(source, descriptor, [...prefix, BigInt.asIntN(256, bits)]),
    );
  }
  const path = concatenateResolved(ctx, [
    rawParam(toWord(32n)),
    rawParam(toWord(BigInt(prefix.length + 1))),
    ...prefix.map((i) => rawParam(toWord(i))),
    index,
  ]);
  const fn = CORE_ABI.find(
    (f) => f.type === "function" && f.name === "nav",
  ) as AbiFunction;
  const call = buildCall(ctx, fn, [
    { kind: "value", value: source as never },
    { kind: "value", value: descriptor },
    canonicalArgSpec(ctx, { type: "int256[]" }, path),
  ]);
  return callParam(ctx, rawParam(toWord(BigInt(ctx.core))), call);
}

export function typedValueOperand(
  param: InputParam,
  element: AbiParameter,
): Operand {
  return {
    kind: "call",
    param,
    cat:
      element.type.startsWith("tuple") || element.type.includes("[")
        ? "Bytes"
        : categoryFromAbiType(element.type),
    abiType: element,
    ...(element.type.endsWith("[]")
      ? {
          collection: {
            element: { ...element, type: element.type.slice(0, -2) },
            transport: "abi" as const,
          },
        }
      : {}),
  };
}

import { encodeParams, NodeType, Num } from "@evmcrispr/sdk";
import {
  formatParamType,
  isBangHelperNode,
  type TypedArrayArg,
  typedArrayArg,
} from "@evmcrispr/sdk/onchain";
import { encodeAbiParameters, isAddress, isHex } from "viem";

export function constantType(value: unknown): AbiParameter {
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
        ...constantType(v),
        name,
      })),
    };
  throw new ErrorException(
    "Cannot infer a concrete ABI type for this array element",
  );
}
function constantElement(values: unknown[]): AbiParameter {
  if (values.length === 0) return { type: "uint256" };
  const types = values.map(constantType);
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
export async function arrayArg(
  ctx: CompileCtx,
  node: Node,
  helper: string,
): Promise<TypedArrayArg> {
  if (node.type === NodeType.CallExpression) {
    const { param, terminal } = await compileCallValue(
      ctx,
      node as CallExpressionNode,
    );
    const fixed = terminal.type.match(/\[(\d+)\]$/);
    if (fixed) {
      const count = BigInt(fixed[1]);
      const element = {
        ...terminal,
        type: terminal.type.slice(0, -fixed[0].length),
      } as AbiParameter;
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
      const normalized = unwrapBytesParam(
        ctx,
        concatParam(ctx, [toWord(32n), toWord(count), tail]),
      );
      return {
        element,
        param: normalized,
        ...(/^(u?int\d*|address|bool|bytes32)$/.test(element.type)
          ? { words: arrayWordsParam(ctx, normalized, element.type) }
          : {}),
      };
    }
    return typedArrayArg(ctx, node, helper);
  }
  if (isBangHelperNode(node)) return typedArrayArg(ctx, node, helper);
  const value = await ctx.interpreters.interpretNode(node);
  if (!Array.isArray(value))
    throw new ErrorException(`@${helper} expects an array`);
  const element = constantElement(value);
  const words = /^(u?int\d*|address|bool|bytes32)$/.test(element.type)
    ? rawParam(
        encodeAbiParameters(
          [{ type: "bytes" }],
          [
            `0x${value.map((v) => encodeParams([element], [v] as never, helper).slice(2)).join("")}`,
          ],
        ),
      )
    : undefined;
  return {
    element,
    param: rawParam(
      encodeParams(
        [{ ...element, type: `${element.type}[]` }],
        [value] as never,
        helper,
      ),
    ),
    words,
  };
}

/** Signed integer input validation shared with live array indexing. */
export function indexValue(value: unknown): bigint {
  return checkedRange(checkedInteger(value).value, true);
}

import {
  arrayValuesParam,
  collectionReadParam,
  compileOnchainHelper,
  packedArrayOperand,
} from "@evmcrispr/sdk/onchain";
/** Preserve each ABI lane when transposing generic tuple pairs. */
export async function genericLane(
  ctx: CompileCtx,
  node: Node,
  lane: 0 | 1,
  helper: string,
): Promise<Operand | undefined> {
  if (isBangHelperNode(node)) {
    const operand = await compileOnchainHelper(ctx, node);
    if (
      operand.kind === "call" &&
      operand.collection?.transport === "words" &&
      operand.collection.lanes
    )
      return undefined;
  }
  const array = await arrayArg(ctx, node, helper);
  if (array.words) return undefined;
  const tuple = array.element;
  if (
    tuple.type !== "tuple" ||
    !("components" in tuple) ||
    tuple.components.length !== 2
  )
    throw new ErrorException(`@${helper} needs an array of two-element tuples`);
  const [left, right] = tuple.components;
  return packedArrayOperand(
    ctx,
    collectionReadParam(ctx, "unzipValues", [
      { kind: "value", value: formatParamType(left) },
      { kind: "value", value: formatParamType(right) },
      canonicalArgSpec(ctx, { type: "bytes[]" }, arrayValuesParam(ctx, array)),
      { kind: "value", value: Num(lane) },
    ]),
    lane === 0 ? left : right,
  );
}
