import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "load",
  args: [{ name: "moduleName", type: "module" }],
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
});
