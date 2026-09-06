import {
  checkedInteger,
  checkedRange,
  ErrorException,
  type Node,
} from "@evmcrispr/sdk";
import type { CompileCtx, InputParam } from "@evmcrispr/sdk/onchain";
import { rawParam, resolveCallParam, toWord } from "@evmcrispr/sdk/onchain";
import { toFunctionSelector } from "viem";
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
  const args = [source, await indexParam(ctx, start)];
  if (!single)
    args.push(
      end ? await indexParam(ctx, end) : rawParam(toWord((1n << 255n) - 1n)),
    );
  const types = single ? "(bytes,int256)" : "(bytes,int256,int256)";
  return resolveCallParam(
    ctx,
    rawParam(toWord(BigInt(ctx.operators))),
    toFunctionSelector(`${name}${types}`),
    types,
    args,
  );
}
