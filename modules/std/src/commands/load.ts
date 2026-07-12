import type { ArrayExpressionNode, ImportValue, Module } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  NodeType,
  parseImportList,
} from "@evmcrispr/sdk";
import type Std from "..";

function resolveImportKind(
  mod: Module,
  kind: "command" | "helper",
  sourceName: string,
): ImportValue["kind"] | undefined {
  if (kind === "command") {
    return mod.commands[sourceName] ? "command" : undefined;
  }
  if (mod.helpers[sourceName]) return "helper";
  if (mod.constants[sourceName] !== undefined) return "constant";
  return undefined;
}

export default defineCommand<Std>({
  name: "load",
  description:
    "Load a module. Its commands and helpers become available qualified (`mod:cmd`, `@mod:helper`); an import list makes selected names available unqualified.",
  batchable: false,
  args: [
    {
      name: "moduleName",
      type: "module",
      description: "Module name (e.g. `aragonos`, `sim`)",
    },
    {
      name: "imports",
      type: "expression",
      optional: true,
      description:
        "Import list: `[cmd cmd>renamed @helper @helper>@renamed]` — names usable without the module prefix",
    },
  ],
  async run(module, { moduleName, imports }) {
    if (module.modules.find((m: any) => m.name === moduleName)) {
      throw new ErrorException(`module ${moduleName} already loaded`);
    }

    let ModuleConstructor;
    try {
      ({ default: ModuleConstructor } =
        await module.context.loadModule(moduleName));
    } catch (_e) {
      throw new ErrorException(`module ${moduleName} not found`);
    }
    const instance = new ModuleConstructor(module.context);

    if (imports !== undefined) {
      if (imports.type !== NodeType.ArrayExpression) {
        throw new ErrorException(
          "import list must be a literal array (e.g. load ens [renew @addr])",
        );
      }
      const { entries, errors } = parseImportList(
        imports as ArrayExpressionNode,
      );
      if (errors.length) {
        throw new ErrorException(errors[0].message);
      }

      // Validate every entry before binding anything, so a failed load
      // doesn't leave partial imports behind.
      const resolved: { key: string; value: ImportValue }[] = [];
      for (const entry of entries) {
        const kind = resolveImportKind(instance, entry.kind, entry.sourceName);
        if (!kind) {
          const label =
            entry.kind === "command"
              ? entry.sourceName
              : `@${entry.sourceName}`;
          throw new ErrorException(
            `module ${moduleName} has no ${
              entry.kind === "command" ? "command" : "helper or constant"
            } named ${label}`,
          );
        }
        const key =
          entry.kind === "command" ? entry.boundName : `@${entry.boundName}`;
        if (resolved.some((r) => r.key === key)) {
          throw new ErrorException(`duplicate import ${key}`);
        }
        if (module.bindingsManager.hasBinding(key, BindingsSpace.IMPORT)) {
          throw new ErrorException(
            `import ${key} collides with an existing import — rename it with ${
              entry.kind === "command"
                ? `${entry.sourceName}>newName`
                : `@${entry.sourceName}>@newName`
            }`,
          );
        }
        if (module.bindingsManager.hasBinding(key, BindingsSpace.DEF)) {
          throw new ErrorException(
            `import ${key} collides with a def-defined name`,
          );
        }
        resolved.push({
          key,
          value: { module: moduleName, name: entry.sourceName, kind },
        });
      }

      for (const { key, value } of resolved) {
        module.bindingsManager.setBinding(
          key,
          value,
          BindingsSpace.IMPORT,
          true,
        );
      }
    }

    module.context.modules.push(instance);
  },
});
