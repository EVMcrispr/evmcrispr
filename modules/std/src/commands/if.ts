import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "if",
  description: "Conditionally execute a block of commands.",
  args: [
    { name: "condition", type: "bool" },
    { name: "block", type: "block" },
  ],
  async run(module, { condition, block }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;

    if (!condition) {
      return [];
    }

    return (await interpretNode(block as BlockExpressionNode, {
      blockModule: module.contextualName,
      actionCallback,
    })) as Action[];
  },
});
