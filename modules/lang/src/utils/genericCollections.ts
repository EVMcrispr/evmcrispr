import type { Node } from "@evmcrispr/sdk";
import { checkedInteger, checkedRange, ErrorException } from "@evmcrispr/sdk";
import type { CompileCtx, InputParam, Operand } from "@evmcrispr/sdk/onchain";
import {
  buildCallSegments,
  CONSTRAINT_TYPE,
  CORE_ABI,
  canonicalArgSpec,
  categoryFromAbiType,
  compileCheckedExpr,
  concatenateResolved,
  constBigInt,
  encodeNav,
  encodeRead,
  materializeWord,
  rawParam,
  staticCallParam,
  toWord,
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
  const call = buildCallSegments(ctx, fn, [
    { kind: "value", value: source as never },
    { kind: "value", value: descriptor },
    canonicalArgSpec(ctx, { type: "int256[]" }, path),
  ]);
  return staticCallParam(
    ctx.core,
    encodeRead(
      rawParam(toWord(BigInt(ctx.core))),
      call.selector,
      call.segments,
    ),
  );
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

import { Num } from "@evmcrispr/sdk";
import {
  typedArrayArg as arrayArg,
  formatParamType,
  isBangHelperNode,
} from "@evmcrispr/sdk/onchain";

export {
  constantAbiType as constantType,
  typedArrayArg as arrayArg,
} from "@evmcrispr/sdk/onchain";

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
    { validated: true },
  );
}
