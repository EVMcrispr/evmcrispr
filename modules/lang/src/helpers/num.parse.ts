import {
  defineHelper,
  ErrorException,
  markSignedInteger,
  Num,
} from "@evmcrispr/sdk";
import {
  type ArgSpec,
  buildCall,
  compileOperand,
  materializeWord,
  opCallParam,
} from "@evmcrispr/sdk/onchain";
import { type AbiFunction, parseAbiItem, stringToHex } from "viem";
import type Lang from "..";
import { decimalRounding, decimalSignedness, parseDecimal } from "./_decimal";

export default defineHelper<Lang>({
  name: "num.parse",
  description:
    "Parse ordinary decimal notation into base units with explicit rounding and signedness.",
  compileDescription:
    "Parse live decimal strings; precision must be 0–77. Rounding and signedness are constant options.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: ["string", "number"],
      description: "Input decimal string",
    },
    {
      name: "decimals",
      type: "number",
      description: "Decimal precision (0–77)",
    },
    {
      name: "rounding",
      type: "string",
      optional: true,
      description: "trunc (default), floor, or ceil",
    },
    {
      name: "signedness",
      type: "string",
      optional: true,
      description: "signed (default) or unsigned",
    },
  ],
  async run(_, { value, decimals, rounding, signedness }) {
    const result = Num(parseDecimal(value, decimals, rounding, signedness));
    return decimalSignedness(signedness) ? markSignedInteger(result) : result;
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2 || node.args.length > 4)
      throw new ErrorException(
        "@num.parse! expects (value decimals rounding? signedness?)",
      );
    const rounding = decimalRounding(
      node.args[2]
        ? await ctx.interpreters.interpretNode(node.args[2])
        : undefined,
    );
    const signed = decimalSignedness(
      node.args[3]
        ? await ctx.interpreters.interpretNode(node.args[3])
        : undefined,
    );
    const value = await compileOperand(ctx, node.args[0]);
    const precision = await compileOperand(ctx, node.args[1]);
    if (precision.cat !== "Uint" || precision.scale)
      throw new ErrorException("Decimal precision must be an unsigned integer");
    const specs: ArgSpec[] = [];
    if (value.kind === "const")
      specs.push({ kind: "value", value: stringToHex(String(value.value)) });
    else {
      if (value.cat !== "String" && value.cat !== "Bytes")
        throw new ErrorException(
          "@num.parse! live input must be a string or bytes",
        );
      specs.push({ kind: "dyn", param: value.param });
    }
    specs.push(
      { kind: "word", param: materializeWord(ctx, precision) },
      { kind: "value", value: Num(rounding) },
    );
    const fn = parseAbiItem(
      `function ${signed ? "parseUnits" : "parseUnitsUnsigned"}(bytes,uint256,uint8) pure returns (${signed ? "int256" : "uint256"})`,
    ) as AbiFunction;
    const call = buildCall(ctx, fn, specs);
    return {
      kind: "call",
      cat: signed ? "Int" : "Uint",
      param: opCallParam(ctx, call),
    };
  },
});
