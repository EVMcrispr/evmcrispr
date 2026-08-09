import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { compileExpr } from "@evmcrispr/sdk/onchain";
import type Std from "..";
import { evaluateBoolExpr, isTruthy, validateNoEmbeddedOps } from "./_expr";

export default defineHelper<Std>({
  name: "bool",
  description:
    "Evaluate a boolean expression or convert a value to a boolean string. As @bool! it composes live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the operators contract.",
  returnType: "bool",
  args: [
    {
      // Stays "any": bool expressions legitimately embed number-, string-
      // and bytes32-returning helpers as comparison operands, so any
      // narrower type would either hide valid helpers or (with "string")
      // disable filtering.
      name: "tokens",
      type: "any",
      rest: true,
      description: "Boolean expression (e.g. `$a > 0 and $b < 100`)",
    },
  ],
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
  // On-chain face: syntax entry point into the expression engine, which
  // stays central — the shunting-yard over raw nodes is shared with
  // @num! and the assert command.
  compile: (ctx, node) => compileExpr(ctx, node.args, "bool"),
});
