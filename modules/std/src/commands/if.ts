import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "if",
  description: "Conditionally execute a block of commands, with an optional else block.",
  args: [
    { name: "condition", type: "bool" },
    { name: "thenBlock", type: "block", description: "Commands when condition is true" },
    { name: "elseBlock", type: "block", description: "Commands when condition is false", optional: true },
  ],
  async run(module, { condition, thenBlock, elseBlock }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;
    const blockOpts = { blockModule: module.contextualName, actionCallback };

    if (condition) {
      return (await interpretNode(
        thenBlock as BlockExpressionNode,
        blockOpts,
      )) as Action[];
    }

    if (elseBlock) {
      return (await interpretNode(
        elseBlock as BlockExpressionNode,
        blockOpts,
      )) as Action[];
    }

    return [];
  },
});
