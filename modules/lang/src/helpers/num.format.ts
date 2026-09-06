import {
  defineHelper,
  ErrorException,
  isSignedInteger,
  Num,
} from "@evmcrispr/sdk";
import {
  compileOperand,
  materializeWord,
  opReadParam,
} from "@evmcrispr/sdk/onchain";
import { formatUnits, toFunctionSelector } from "viem";
import type Lang from "..";
import { decimalPrecision } from "./_decimal";

export default defineHelper<Lang>({
  name: "num.format",
  description:
    "Format an integer in base units as ordinary decimal notation, trimming trailing fractional zeros.",
  compileDescription:
    "Format live signed or unsigned integers with 0–77 decimal places.",
  returnType: "string",
  args: [
    { name: "value", type: "number", description: "Integer in base units" },
    {
      name: "decimals",
      type: "number",
      description: "Decimal precision (0–77)",
    },
  ],
  async run(_, { value, decimals }) {
    const number = Num(value);
    if (!number.isInteger())
      throw new ErrorException("@num.format requires an integer");
    const v = number.toBigInt();
    const signed = v < 0n || isSignedInteger(number);
    if (
      v < -(1n << 255n) ||
      v > (signed ? (1n << 255n) - 1n : (1n << 256n) - 1n)
    )
      throw new ErrorException("@num.format input overflows its integer type");
    return formatUnits(v, decimalPrecision(decimals));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2)
      throw new ErrorException("@num.format! expects (value decimals)");
    const value = await compileOperand(ctx, node.args[0]);
    const precision = await compileOperand(ctx, node.args[1]);
    if (
      (value.cat !== "Int" && value.cat !== "Uint") ||
      value.scale ||
      precision.cat !== "Uint" ||
      precision.scale
    )
      throw new ErrorException(
        "@num.format! requires raw integer units and unsigned precision",
      );
    return {
      kind: "call",
      cat: "String",
      param: opReadParam(
        ctx,
        toFunctionSelector(
          `formatUnits(${value.cat === "Int" ? "int256" : "uint256"},uint256)`,
        ),
        [materializeWord(ctx, value), materializeWord(ctx, precision)],
      ),
    };
  },
});
