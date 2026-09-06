/** Typed ABI-valued collection composition. Values use canonical single-value ABI encoding. */
import type { AbiFunction, AbiParameter, Address, Hex } from "viem";
import { encodeAbiParameters, encodeFunctionData } from "viem";
import { COLLECTIONS_ADDRESS } from "./addresses";
import { type ArgSpec, buildCallSegments, isDynamicParam } from "./construct";
import { encodeNav, encodeRead, encodeResolve, PAYLOAD_STEP } from "./core";
import { type InputParam, rawParam, staticCallParam, toWord } from "./erc8211";
import { OP_SELECTORS, OPERATIONS_ABI } from "./operators";
import { resolveCallParam, resolveValuesParam } from "./resolver";
import type { CompileCtx } from "./types";

export { COLLECTION_SELECTORS, COLLECTIONS_ABI } from "./collection-abi";

import { COLLECTIONS_ABI } from "./collection-abi";
export interface CollectionCallback {
  target: Address;
  selector: Hex;
  arguments: string;
  constants: readonly Hex[];
  first: bigint;
  second: bigint;
  program: Hex;
}

/** Wrap arbitrary resolved returndata in a bytes ABI envelope, without interpreting its shape. */
export function canonicalBytesParam(
  ctx: CompileCtx,
  param: InputParam,
): InputParam {
  return staticCallParam(
    ctx.operators,
    encodeFunctionData({
      abi: OPERATIONS_ABI,
      functionName: "rawCall",
      args: [ctx.core, encodeResolve(param)],
    }),
  );
}
/** Unwrap bytes-returning encoder output to the raw canonical value. */
export function unwrapBytesParam(
  ctx: CompileCtx,
  param: InputParam,
): InputParam {
  return staticCallParam(
    ctx.core,
    encodeNav(param, "(bytes)", [0n, PAYLOAD_STEP]),
  );
}

/** A live canonical ABI value suitable for general calldata construction. */
export function canonicalArgSpec(
  _ctx: CompileCtx,
  type: AbiParameter,
  param: InputParam,
): ArgSpec {
  return isDynamicParam(type)
    ? { kind: "dyn", param }
    : { kind: "encoded", param };
}
export function collectionReadParam(
  ctx: CompileCtx,
  name: string,
  specs: ArgSpec[],
): InputParam {
  const fn = COLLECTIONS_ABI.find(
    (x) => x.type === "function" && x.name === name,
  ) as AbiFunction | undefined;
  if (!fn) throw new Error(`Unknown collection operation ${name}`);
  const call = buildCallSegments(ctx, fn, specs);
  return staticCallParam(
    ctx.core,
    encodeRead(
      rawParam(toWord(BigInt(ctx.collections ?? COLLECTIONS_ADDRESS))),
      call.selector,
      call.segments,
    ),
  );
}

/** Construct a canonical bytes[] from literal payloads or live bytes envelopes. */
export function encodeValuesParam(
  ctx: CompileCtx,
  values: readonly BytesPart[],
): InputParam {
  return resolveValuesParam(
    ctx,
    values.map((v) =>
      typeof v === "string"
        ? rawParam(v)
        : unwrapBytesParam(ctx, livePartParam(v)),
    ),
  );
}

import { type BytesPart, livePartParam } from "./recipes";

/** Concatenate raw resolved spans into a canonical raw ABI value. */
export function concatenateResolved(
  ctx: CompileCtx,
  parts: readonly InputParam[],
): InputParam {
  if (parts.length === 1) return parts[0];
  return unwrapBytesParam(
    ctx,
    resolveCallParam(
      ctx,
      rawParam(toWord(BigInt(ctx.operators))),
      OP_SELECTORS.concat,
      "(bytes[],bytes)",
      [
        resolveValuesParam(ctx, parts),
        rawParam(encodeAbiParameters([{ type: "bytes" }], ["0x"])),
      ],
    ),
  );
}
