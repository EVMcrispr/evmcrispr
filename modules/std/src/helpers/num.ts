import {
  ErrorException,
  Num,
  defineHelper,
  isHexString,
  isNum,
} from "@evmcrispr/sdk";
import { parseUnits } from "viem";
import type Std from "..";

function toNum(v: unknown): Num {
  if (v === true || v === "true") return new Num(1n);
  if (v === false || v === "false") return new Num(0n);
  if (v instanceof Num) return v;
  if (typeof v === "string" && isHexString(v)) return new Num(BigInt(v));
  if (isNum(v)) return Num.coerce(v);
  if (typeof v === "string") return Num.coerce(v);
  throw new ErrorException("Cannot convert value to number");
}

export default defineHelper<Std>({
  name: "num",
  description:
    "Convert a value to a number, optionally applying a decimal shift.",
  returnType: "number",
  args: [
    { name: "value", type: "any" },
    { name: "decimals", type: "number", optional: true },
  ],
  async run(_, { value, decimals }) {
    if (decimals !== undefined) {
      const d = Number(Num.coerce(decimals).toBigInt());
      return new Num(parseUnits(String(value), d));
    }
    return toNum(value);
  },
});
