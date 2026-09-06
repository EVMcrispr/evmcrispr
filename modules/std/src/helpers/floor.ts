import {
  defineHelper,
  ErrorException,
  roundExactInteger,
} from "@evmcrispr/sdk";
import type Std from "..";
import { evaluateArithmeticExpr, toNum, validateNoEmbeddedOps } from "./_expr";

export default defineHelper<Std>({
  name: "floor",
  description:
    "Evaluate exact rational arithmetic, round the final result toward negative infinity, and check its 256-bit integer range.",
  returnType: "number",
  args: [
    {
      name: "tokens",
      type: "any",
      rest: true,
      description: "Arithmetic expression (e.g. `$a + $b * 2`)",
    },
  ],
  async run(_, { tokens }) {
    if (!tokens || tokens.length === 0) {
      throw new ErrorException("@floor requires at least one argument");
    }
    if (tokens.length === 1) {
      validateNoEmbeddedOps(tokens[0], "arithmetic");
      return roundExactInteger(toNum(tokens[0]), "floor");
    }
    return roundExactInteger(evaluateArithmeticExpr(tokens), "floor");
  },
});
