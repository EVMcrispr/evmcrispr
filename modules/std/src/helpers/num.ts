import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { compileExpr } from "@evmcrispr/sdk/onchain";
import type Std from "..";
import { evaluateArithmeticExpr, toNum, validateNoEmbeddedOps } from "./_expr";

export default defineHelper<Std>({
  name: "num",
  description:
    "Evaluate an arithmetic expression or convert a value to a number. As @num! it composes live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the operators contract.",
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
      throw new ErrorException("@num requires at least one argument");
    }
    if (tokens.length === 1) {
      validateNoEmbeddedOps(tokens[0], "arithmetic");
      return toNum(tokens[0]);
    }
    return evaluateArithmeticExpr(tokens);
  },
  // On-chain face: syntax entry point into the expression engine, which
  // stays central — the shunting-yard over raw nodes is shared with
  // @bool! and the assert command.
  compile: (ctx, node) => compileExpr(ctx, node.args, "num"),
});
