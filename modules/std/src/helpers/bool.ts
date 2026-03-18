import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";
import { evaluateBoolExpr, isTruthy, validateNoEmbeddedOps } from "./_expr";

export default defineHelper<Std>({
  name: "bool",
  description:
    "Evaluate a boolean expression or convert a value to a boolean string.",
  returnType: "bool",
  args: [{ name: "tokens", type: "any", rest: true, description: "Boolean expression (e.g. `$a > 0 and $b < 100`)" }],
  async run(_, { tokens }) {
    if (!tokens || tokens.length === 0) {
      throw new ErrorException("@bool requires at least one argument");
    }
    if (tokens.length === 1) {
      validateNoEmbeddedOps(tokens[0], "boolean");
      return isTruthy(tokens[0]) ? "true" : "false";
    }
    return evaluateBoolExpr(tokens) ? "true" : "false";
  },
});
