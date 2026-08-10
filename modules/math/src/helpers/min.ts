import { defineHelper } from "@evmcrispr/sdk";
import { arithCombine, variadicOperands } from "@evmcrispr/sdk/onchain";
import type MathModule from "..";
import { numericValues } from "../utils";

export default defineHelper<MathModule>({
  name: "min",
  description: "Minimum of two or more values.",
  compileDescription:
    "Operands are written out at the call site, or given as one literal array; an array a call returns has no on-chain form here.",
  returnType: "number",
  args: [
    {
      name: "values",
      type: "any",
      rest: true,
      optional: true,
      description: "Two or more numeric operands (or one array of them)",
    },
  ],
  async run(_module, { values }) {
    const nums = numericValues(values, "min");
    return nums.reduce((acc, v) => (v.lt(acc) ? v : acc));
  },
  compile: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "min!");
    return operands.reduce((acc, o) => arithCombine(ctx, "Min", acc, o));
  },
});
