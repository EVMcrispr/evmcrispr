import type { AsExpressionNode } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  insideNode,
  NodeType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { ALIAS, MODULE } = BindingsSpace;
const { AsExpression, ProbableIdentifier, StringLiteral } = NodeType;

export default defineCommand<Std>({
  name: "load",
  args: [{ name: "moduleArg", type: "any", skipInterpret: true }],
  async run(module, _args, { node, interpreters }) {
    const { interpretNode } = interpreters;
    const [argNode] = node.args;
    const type = argNode.type;
    const isIdentifier = type === ProbableIdentifier || type === StringLiteral;

    if (type !== AsExpression && type !== StringLiteral && !isIdentifier) {
      throw new ErrorException("invalid argument. Expected a string");
    }

    let moduleName: string, moduleAlias: string | undefined;

    if (argNode.type === AsExpression) {
      [moduleName, moduleAlias] = await interpretNode(argNode, {
        treatAsLiteral: true,
      });
    } else {
      moduleName = await interpretNode(argNode, {
        treatAsLiteral: true,
      });
    }

    if (module.modules.find((m: any) => m.name === moduleName)) {
      throw new ErrorException(`module ${moduleName} already loaded`);
    }

    if (moduleAlias) {
      const m = module.modules.find((m: any) => m.alias === moduleAlias);

      if (m) {
        throw new ErrorException(`alias already used for module ${m.name}`);
      }
    }
    try {
      const { default: ModuleConstructor } =
        await module.context.loadModule(moduleName);
      module.context.modules.push(
        new ModuleConstructor(module.context, moduleAlias),
      );
    } catch (_e) {
      throw new ErrorException(`module ${moduleName} not found`);
    }
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, _, caretPos) {
    switch (argIndex) {
      case 0: {
        const arg = nodeArgs[0];
        if (
          arg &&
          arg.type === AsExpression &&
          insideNode((arg as AsExpressionNode).right, caretPos)
        ) {
          return [];
        }
        // Module names are resolved at runtime via context
        return [];
      }
      default:
        return [];
    }
  },
  async runEagerExecution({ args }, cache, _, caretPos) {
    if (!args.length || insideNode(args[0], caretPos)) {
      return;
    }

    const moduleNameArg = args[0];
    let moduleName: string,
      moduleAlias = "";

    if (moduleNameArg.type === AsExpression) {
      const asNode = moduleNameArg as AsExpressionNode;
      moduleName = asNode.left.value;
      moduleAlias = asNode.right.value;
    } else {
      moduleName = moduleNameArg.value;
    }

    const moduleBinding = cache.getBinding(moduleName, MODULE);

    if (moduleBinding) {
      return (eagerBindingsManager) => {
        if (moduleAlias) {
          eagerBindingsManager.setBinding(moduleName, moduleAlias, ALIAS);
          eagerBindingsManager.setBinding(moduleAlias, moduleName, ALIAS);
        }
        eagerBindingsManager.setBindings(moduleBinding);
      };
    }

    // Full module loading happens in run() via module.context.loadModule()
    return;
  },
});
