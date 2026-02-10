import { ErrorException } from "../../../errors";
import type { Action } from "../../../types";
import { BindingsSpace, NodeType } from "../../../types";
import { defineCommand } from "../../../utils";
import type { Std } from "../Std";

const { USER } = BindingsSpace;
const { VariableIdentifier } = NodeType;

export const _for = defineCommand<Std>({
  args: [
    { name: "variable", type: "any", skipInterpret: true },
    { name: "connector", type: "any", skipInterpret: true },
    { name: "array", type: "any", skipInterpret: true },
    { name: "block", type: "any", skipInterpret: true },
  ],
  async run(module, _args, { node, interpreters }) {
    const { interpretNode, actionCallback } = interpreters;
    const [varNode, connectorNode, arrayNode, blockExpressionNode] = node.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(`expected a variable identifier`);
    }

    if (connectorNode.value !== "of") {
      throw new ErrorException(`expected of`);
    }

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException("last argument should be a set of commands");
    }

    const varName = varNode.value;
    const array = await interpretNode(arrayNode);
    const actions = [];

    module.bindingsManager.enterScope("for");
    for (const varValue of array) {
      module.bindingsManager.setBinding(
        varName,
        varValue,
        USER,
        false,
        undefined,
        true,
      );
      const commandActions = (await interpretNode(blockExpressionNode, {
        blockModule: module.contextualName,
        actionCallback,
      })) as Action[];
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
