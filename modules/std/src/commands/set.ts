import {
  BindingsSpace,
  defineCommand,
  inSameLineThanNode,
  NodeType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { ADDR, USER } = BindingsSpace;

export default defineCommand<Std>({
  name: "set",
  args: [
    { name: "variable", type: "variable" },
    { name: "value", type: "any" },
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
  async run(module, { variable, value }) {
    module.bindingsManager.setBinding(
      variable,
      value,
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
