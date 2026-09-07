/** Typed ABI-valued collection composition. Values use canonical single-value ABI encoding. */
import type { AbiFunction, AbiParameter, Address, Hex } from "viem";
import { encodeAbiParameters, encodeFunctionData } from "viem";
import { COLLECTIONS_ADDRESS } from "./addresses";
import {
  type ArgSpec,
  buildCall,
  callParam,
  isDynamicParam,
} from "./construct";
import {
  encodeNav,
  encodeResolve,
  gatherParam,
  getParam,
  PAYLOAD_STEP,
} from "./core";
import { type InputParam, rawParam, staticCallParam, toWord } from "./erc8211";
import { OP_SELECTORS, OPERATIONS_ABI } from "./operators";
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
  /** `abi.encode(Expression)` when the callback is a graph evaluated by
   *  Expressions; empty for a direct selector call. */
  expression: Hex;
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
  return callParam(
    ctx,
    rawParam(toWord(BigInt(ctx.collections ?? COLLECTIONS_ADDRESS))),
    buildCall(ctx, fn, specs),
  );
}

/** Construct a canonical bytes[] from literal payloads or live bytes
 *  envelopes: the core's `gather` resolves each live part once and takes
 *  its raw payload as one element. */
export function encodeValuesParam(
  ctx: CompileCtx,
  values: readonly BytesPart[],
): InputParam {
  return gatherParam(
    ctx.core,
    values.map((v) =>
      typeof v === "string"
        ? rawParam(v)
        : unwrapBytesParam(ctx, livePartParam(v)),
    ),
  );
}

import { type BytesPart, livePartParam } from "./recipes";

/** The ABI-encoded body of an argument tuple assembled in-frame from
 *  whole canonical values (`gather` resolves each once, Operations'
 *  `encodeBytes` lays the tuple out under `argumentTypes`), returned
 *  as the raw body bytes. For values that are not a call; a call takes
 *  the core's `get` directly. */
export function encodeArgumentsParam(
  ctx: CompileCtx,
  argumentTypes: string,
  args: readonly InputParam[],
): InputParam {
  return unwrapBytesParam(
    ctx,
    getParam(
      ctx.core,
      rawParam(toWord(BigInt(ctx.operators))),
      OP_SELECTORS.encodeBytes,
      "(string,bytes[])",
      [
        rawParam(encodeAbiParameters([{ type: "string" }], [argumentTypes])),
        gatherParam(ctx.core, args),
      ],
    ),
  );
}

/** Concatenate raw resolved spans into a canonical raw ABI value: the
 *  core gathers the parts once each and calls Operations' `concat`
 *  through `get`. */
export function concatenateResolved(
  ctx: CompileCtx,
  parts: readonly InputParam[],
): InputParam {
  if (parts.length === 1) return parts[0];
  return unwrapBytesParam(
    ctx,
    getParam(
      ctx.core,
      rawParam(toWord(BigInt(ctx.operators))),
      OP_SELECTORS.concat,
      "(bytes[],bytes)",
      [
        gatherParam(ctx.core, parts),
        rawParam(encodeAbiParameters([{ type: "bytes" }], ["0x"])),
      ],
    ),
  );
}
