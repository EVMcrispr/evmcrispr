import { defineHelper, evaluateCheckedExpression } from "@evmcrispr/sdk";
import { compileCheckedExpr } from "@evmcrispr/sdk/onchain";
import type Std from "..";

export default defineHelper<Std>({
  name: "calcCeil",
  description:
    "Evaluate checked 256-bit integer arithmetic; root division rounds ceil.",
  compileDescription: "The same checked arithmetic evaluated on-chain.",
  returnType: "number",
  args: [
    {
      name: "tokens",
      type: "any",
      rest: true,
      description: "Integer arithmetic expression",
    },
  ],
  run: async (_, { tokens }) => evaluateCheckedExpression(tokens, "ceil"),
  compile: (ctx, node) => compileCheckedExpr(ctx, node.args, "ceil"),
});
