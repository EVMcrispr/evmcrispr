import { ErrorException } from "../../../errors";
import { BindingsSpace, NodeType } from "../../../types";
import { defineCommand, inSameLineThanNode } from "../../../utils";
import type { Std } from "../Std";

const { VariableIdentifier } = NodeType;
const { ADDR, USER } = BindingsSpace;

export const set = defineCommand<Std>({
  args: [
    { name: "variable", type: "any", skipInterpret: true },
    { name: "value", type: "any", skipInterpret: true },
  ],
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return [];
      case 1: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [ADDR] });
      }
      default:
        return [];
    }
  },
  async run(module, _args, { node, interpreters }) {
    const { interpretNode } = interpreters;
    const [varNode, valueNode] = node.args;

    if (varNode.type !== VariableIdentifier) {
      throw new ErrorException(`expected a variable identifier`);
    }

    const varName = varNode.value;
    const varValue = await interpretNode(valueNode);

    module.bindingsManager.setBinding(
      varName,
      varValue,
      USER,
      true,
      undefined,
      true,
    );
  },
  async runEagerExecution(c, cache, __, caretPos) {
    if (inSameLineThanNode(c, caretPos)) {
      return;
    }

    const [varNameNode, varValueNode] = c.args;

    if (varNameNode && varNameNode.type === NodeType.VariableIdentifier) {
      const varName = varNameNode.value;
      const varValue = varValueNode.value;

      cache.setBinding(varName, varValue, USER, false, undefined, true);

      return (eagerBindingsManager) =>
        eagerBindingsManager.setBinding(varName, varValueNode.value, USER);
    }
  },
});
