import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  insideNode,
} from "@evmcrispr/sdk";
import type Std from "..";

const { MODULE } = BindingsSpace;

export default defineCommand<Std>({
  name: "load",
  args: [{ name: "moduleName", type: "string" }],
  opts: [{ name: "as", type: "string" }],
  async run(module, { moduleName }, { opts }) {
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
  buildCompletionItemsForArg(argIndex, _nodeArgs, bindingsManager) {
    if (argIndex !== 0) return [];

    const json = bindingsManager.getMetadata("__available_modules__");
    if (!json) return [];

    try {
      const available = JSON.parse(json) as string[];
      // Exclude modules that are already loaded in the current script
      return available.filter(
        (name) => !bindingsManager.hasBinding(name, MODULE),
      );
    } catch {
      return [];
    }
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

    if (moduleBinding?.value) {
      return (eagerBindingsManager) => {
        const moduleData = moduleAlias
          ? { ...moduleBinding.value!, alias: moduleAlias }
          : moduleBinding.value;

        // Always register under the canonical name (needed for cache lookups)
        eagerBindingsManager.setBinding(moduleName, moduleData, MODULE);

        if (moduleAlias) {
          // Also register under the alias so command resolution works
          eagerBindingsManager.setBinding(moduleAlias, moduleData, MODULE);
        }
      };
    }

    // Full module loading happens in run() via module.context.loadModule()
    return;
  },
});
