/** Typed ABI-valued collection composition. Values use canonical single-value ABI encoding. */
import type { AbiFunction, AbiParameter, Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { COLLECTIONS_ADDRESS } from "./addresses";
import { type ArgSpec, buildCallSegments, isDynamicParam } from "./construct";
import { encodeNav, encodeRead, encodeResolve, PAYLOAD_STEP } from "./core";
import { type InputParam, rawParam, staticCallParam, toWord } from "./erc8211";
import { envelopeLenParam } from "./layout";
import { OPERATIONS_ABI, opSelector } from "./operators";
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
  ctx: CompileCtx,
  type: AbiParameter,
  param: InputParam,
): ArgSpec {
  if (!isDynamicParam(type)) return { kind: "encoded", param };
  // spliceLayout sizes everything after [offset][first tail word]. This also
  // handles tuples and nested arrays, where that first tail word is not a length.
  const total = envelopeLenParam(ctx, canonicalBytesParam(ctx, param));
  const payload = staticCallParam(
    ctx.core,
    encodeRead(rawParam(toWord(BigInt(ctx.operators))), opSelector("sub"), [
      total,
      rawParam(toWord(64n)),
    ]),
  );
  return { kind: "dyn", param, payload };
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
  const slots: Slot[] = values.map((v) =>
    typeof v === "string"
      ? { tail: bytesTail(v) }
      : {
          param: livePartParam(v),
          payload: bytesPayloadParam(ctx, livePartParam(v)),
        },
  );
  const { offsets, tail } = spliceLayout(
    ctx,
    slots,
    64 + 32 * values.length,
    64,
  );
  const segments = mergeSegments([
    toWord(32n).slice(2),
    toWord(BigInt(values.length)).slice(2),
    ...offsets.map(wordPiece),
    ...tail,
  ]);
  return concatenateResolved(ctx, segments);
}

import {
  bytesPayloadParam,
  bytesTail,
  mergeSegments,
  type Slot,
  spliceLayout,
  wordPiece,
} from "./layout";
import { type BytesPart, concatParam, livePartParam } from "./recipes";

/** Concatenate raw resolved spans into a canonical raw ABI value. */
export function concatenateResolved(
  ctx: CompileCtx,
  parts: readonly InputParam[],
): InputParam {
  if (parts.length === 1) return parts[0];
  if (parts.length > 4) {
    const groups: InputParam[] = [];
    for (let i = 0; i < parts.length; i += 4)
      groups.push(concatenateResolved(ctx, parts.slice(i, i + 4)));
    return concatenateResolved(ctx, groups);
  }
  return unwrapBytesParam(
    ctx,
    concatParam(
      ctx,
      parts.map((p) => canonicalBytesParam(ctx, p)),
    ),
  );
}
