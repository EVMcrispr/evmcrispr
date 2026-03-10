import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";
import { evaluateArithmeticExpr, toNum, validateNoEmbeddedOps } from "./_expr";

export default defineHelper<Std>({
  name: "num",
  description:
    "Evaluate an arithmetic expression or convert a value to a number.",
  returnType: "number",
  args: [{ name: "tokens", type: "any", rest: true }],
  async run(_, { tokens }) {
    if (!tokens || tokens.length === 0) {
      throw new ErrorException("@num requires at least one argument");
    }
    if (tokens.length === 1) {
      validateNoEmbeddedOps(tokens[0], "arithmetic");
      return toNum(tokens[0]);
    }
    return evaluateArithmeticExpr(tokens);
  },
});
