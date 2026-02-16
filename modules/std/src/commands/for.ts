import type { Action, BlockExpressionNode } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  NodeType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

export default defineCommand<Std>({
  name: "for",
  args: [
    { name: "variable", type: "variable" },
    { name: "connector", type: "string" },
    { name: "array", type: "any" },
    { name: "block", type: "block" },
  ],
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
  async runEagerExecution(c, cache) {
    const [varNameNode] = c.args;

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;

      cache.setBinding(varName, "array-element", USER, false, undefined, true);

      return (eagerBindingsManager) =>
        eagerBindingsManager.setBinding(varName, "array-element", USER);
    }
  },
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1:
        return ["of"];
      case 2: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [USER] });
      }
      default:
        return [];
    }
  },
});
