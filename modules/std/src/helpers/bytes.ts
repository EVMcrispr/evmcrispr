import {
  ErrorException,
  Num,
  defineHelper,
  fieldItem,
  isHexString,
  isNum,
} from "@evmcrispr/sdk";
import { toHex } from "viem";
import type Std from "..";

function toBytes(v: unknown): string {
  if (v instanceof Num) {
    if (!v.isInteger()) throw new ErrorException("Operand must be an integer");
    return toHex(v.toBigInt());
  }
  if (typeof v === "bigint") return toHex(v);
  if (typeof v === "string") {
    if (isHexString(v)) return v;
    return toHex(v);
  }
  if (isNum(v)) return toHex(Num(v).toBigInt());
  throw new ErrorException("Cannot convert value to bytes");
}

function bitwiseOp(left: bigint, op: string, right: bigint): bigint {
  switch (op) {
    case "&":
      return left & right;
    case "|":
      return left | right;
    case "<<":
      return left << right;
    case ">>":
      return left >> right;
    default:
      throw new ErrorException(`Operator ${op} not recognized`);
  }
}

export default defineHelper<Std>({
  name: "bytes",
  description:
    "Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation.",
  returnType: "bytes",
  args: [
    { name: "a", type: "any", description: "Value to convert or left operand" },
    { name: "b", type: "string", description: "Operator (`&` `|` `<<` `>>`) or `utf8`", optional: true },
    { name: "c", type: "any", description: "Right operand for bitwise ops", optional: true },
  ],
  completions: { b: () => ["&", "|", "<<", ">>", "utf8"].map(fieldItem) },
  async run(_, { a, b, c }) {
    if (b === undefined) return toBytes(a);
    if (b === "utf8") return toHex(String(a));
    if (c !== undefined) {
      const l = BigInt(toBytes(a));
      const r = BigInt(toBytes(c));
      return toHex(bitwiseOp(l, b, r));
    }
    throw new ErrorException(
      "@bytes expects 1 arg (conversion), 2 with utf8, or 3 (bitwise)",
    );
  },
});
