import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

const MAX_ITERATIONS = 10_000;

export default defineCommand<Std>({
  name: "while",
  description: "Repeat a block while a condition is true.",
  args: [
    {
      name: "condition",
      type: "expression",
      description: "Expression; loop continues while truthy",
    },
    { name: "block", type: "block", description: "Commands to repeat" },
  ],
  async run(module, { condition, block }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;
    const actions: Action[] = [];

    module.bindingsManager.enterScope("while");
    let i = 0;
    while (i++ < MAX_ITERATIONS) {
      const cond = await interpretNode(condition);
      if (cond !== true && cond !== "true") break;
      actions.push(
        ...((await interpretNode(block as BlockExpressionNode, {
          blockModule: module.contextualName,
          actionCallback,
        })) as Action[]),
      );
    }
    module.bindingsManager.exitScope();

    if (i > MAX_ITERATIONS) {
      throw new ErrorException("while: exceeded 10,000 iterations");
    }
    return actions;
  },
});
