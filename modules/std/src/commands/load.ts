import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  insideNode,
  NodeType,
} from "@evmcrispr/sdk";
import type Std from "..";

const { ALIAS, MODULE } = BindingsSpace;
const { ProbableIdentifier, StringLiteral } = NodeType;

export default defineCommand<Std>({
  name: "load",
  args: [{ name: "moduleArg", type: "any", skipInterpret: true }],
  opts: [{ name: "as", type: "string" }],
  async run(module, _args, { opts, node, interpreters }) {
    const { interpretNode } = interpreters;
    const [argNode] = node.args;
    const type = argNode.type;
    const isIdentifier = type === ProbableIdentifier || type === StringLiteral;

    if (!isIdentifier) {
      throw new ErrorException("invalid argument. Expected a string");
    }

    const moduleName: string = await interpretNode(argNode, {
      treatAsLiteral: true,
    });
    const moduleAlias: string | undefined = opts.as as string | undefined;

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
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution({ args, opts }, cache, _, caretPos) {
    if (!args.length || insideNode(args[0], caretPos)) {
      return;
    }

    const moduleNameArg = args[0];
    const moduleName: string = moduleNameArg.value;

    // Extract alias from --as option
    const asOpt = opts.find((o) => o.name === "as");
    const moduleAlias: string = asOpt?.value?.value ?? "";

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
