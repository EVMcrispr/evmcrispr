import { defineHelper } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type MathModule from "..";
import { numericValues } from "../utils";

export default defineHelper<MathModule>({
  name: "max",
  description: "Maximum of two or more values.",
  returnType: "number",
  args: [
    {
      name: "values",
      type: "number",
      rest: true,
      optional: true,
      description: "Two or more numeric operands (or one array of them)",
    },
  ],
  async run(_module, { values }) {
    const nums = numericValues(values, "max");
    return nums.reduce((acc, v) => (v.gt(acc) ? v : acc));
  },
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "max!");
    return operands.reduce((acc, o) => arithCombine(ctx, "Max", acc, o));
  },
});
