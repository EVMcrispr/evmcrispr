import { toFunctionSelector } from "viem";
import { ErrorException } from "../errors";
import { encodeCond, encodeRead } from "./core";
import { type InputParam, rawParam, staticCallParam, toWord } from "./erc8211";
import type { Category, CompileCtx } from "./types";

/** Validate a live integer before its word is used as an ABI argument. */
export function guardAbiInteger(
  ctx: CompileCtx,
  param: InputParam,
  actual: Category,
  destination: string,
): InputParam {
  const m = /^(u?int)(\d*)$/.exec(destination);
  if (!m) return param;
  if (actual !== "Uint" && actual !== "Int")
    throw new ErrorException(`Cannot encode ${actual} as ${destination}`);
  const bits = BigInt(m[2] || "256");
  const signed = m[1] === "int";
  const word = (x: bigint) => rawParam(toWord(x));
  const op = (name: string, s: boolean, a: InputParam, b: InputParam) =>
    staticCallParam(
      ctx.core,
      encodeRead(
        word(BigInt(ctx.operators)),
        toFunctionSelector(
          `${name}(${s ? "int256,int256" : "uint256,uint256"})`,
        ),
        [a, b],
      ),
    );
  const overflow = op("add", false, word((1n << 256n) - 1n), word(1n));
  const check = (valid: InputParam, value: InputParam) =>
    staticCallParam(ctx.core, encodeCond(valid, value, overflow));
  let result = param;
  if (actual === "Int") {
    const min = signed ? -(1n << (bits - 1n)) : 0n;
    if (!signed || bits < 256n)
      result = check(op("ge", true, param, word(min)), result);
    if (signed && bits < 256n)
      result = check(
        op("le", true, param, word((1n << (bits - 1n)) - 1n)),
        result,
      );
    if (!signed && bits < 255n)
      result = check(op("le", true, param, word((1n << bits) - 1n)), result);
  } else {
    const max = signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
    if (signed || bits < 256n)
      result = check(op("le", false, param, word(max)), result);
  }
  return result;
}
