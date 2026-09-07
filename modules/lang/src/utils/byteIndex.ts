import {
  checkedInteger,
  checkedRange,
  ErrorException,
  type Node,
} from "@evmcrispr/sdk";
import type { ArgSpec, CompileCtx, InputParam } from "@evmcrispr/sdk/onchain";
import { buildCall, callParam, rawParam, toWord } from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem } from "viem";
import { indexParam } from "./genericCollections";

export function byteIndex(value: unknown): number {
  const integer = checkedInteger(value).value;
  checkedRange(integer, true);
  return Number(integer);
}
export function decodeStringSlice(value: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      value,
    );
  } catch {
    throw new ErrorException(
      "String byte range cuts a UTF-8 character; use bytes.at or bytes.slice for raw bytes",
    );
  }
}
export async function byteRangeParam(
  ctx: CompileCtx,
  source: InputParam,
  start: Node,
  end: Node | undefined,
  strings: boolean,
  single: boolean,
): Promise<InputParam> {
  const name = single
    ? strings
      ? "stringAt"
      : "byteAt"
    : strings
      ? "stringSlice"
      : "sliceRange";
  // One runtime-sized live (the source) among words: the `read` host
  // with literal offsets, the source spliced last.
  const specs: ArgSpec[] = [
    { kind: "dyn", param: source },
    { kind: "word", param: await indexParam(ctx, start) },
  ];
  if (!single)
    specs.push(
      end
        ? { kind: "word", param: await indexParam(ctx, end) }
        : { kind: "value", value: ((1n << 255n) - 1n) as never },
    );
  const types = single ? "(bytes,int256)" : "(bytes,int256,int256)";
  const fn = parseAbiItem(
    `function ${name}${types} pure returns (bytes)`,
  ) as AbiFunction;
  return callParam(
    ctx,
    rawParam(toWord(BigInt(ctx.operators))),
    buildCall(ctx, fn, specs),
  );
}
