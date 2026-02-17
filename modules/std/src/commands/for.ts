import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  fieldItem,
} from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

export default defineCommand<Std>({
  name: "for",
  description: "Iterate over an array, executing a block for each element.",
  args: [
    { name: "variable", type: "variable" },
    { name: "connector", type: "string" },
    { name: "array", type: "any" },
    { name: "block", type: "block" },
  ],
  completions: {
    connector: () => [fieldItem("of")],
  },
  async run(module, { variable, connector, array, block }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;

    if (connector !== "of") {
      throw new ErrorException(`expected "of", got "${connector}"`);
    }

    const actions = [];

    module.bindingsManager.enterScope("for");
    for (const varValue of array) {
      module.bindingsManager.setBinding(
        variable,
        varValue,
        USER,
        false,
        undefined,
        true,
      );
      const commandActions = (await interpretNode(
        block as BlockExpressionNode,
        {
          blockModule: module.contextualName,
          actionCallback,
        },
      )) as Action[];
      actions.push(...commandActions);
    }
    module.bindingsManager.exitScope();
    return actions;
  },
});
