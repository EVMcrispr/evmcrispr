import type { ArrayExpressionNode, ImportValue, Module } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  NodeType,
  parseImportList,
} from "@evmcrispr/sdk";
import type Std from "..";
import { loadExternalEvmlModule } from "../utils/evmlModules";

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
      description:
        "Module name (e.g. `aragonos`, `sim`); with --from, `name>alias` loads the module under a local alias",
    },
    {
      name: "imports",
      type: "expression",
      optional: true,
      description:
        "Import list: `[cmd cmd>renamed @helper @helper>@renamed]` — names usable without the module prefix",
    },
  ],
  opts: [
    {
      name: "from",
      type: "string",
      description:
        "ipfs://<cid> of an external EVML module file whose def module name matches the load line (rename with name>alias)",
    },
  ],
  async run(module, { moduleName: rawName, imports }, { opts, interpreters }) {
    // `name>alias` renames an external module locally (only with --from —
    // registry namespaces are never aliased).
    const parts = String(rawName).split(">");
    if (parts.length > 2 || parts.some((p) => !p.length)) {
      throw new ErrorException(
        `invalid module name "${rawName}" — expected name or name>alias`,
      );
    }
    const [canonical, rename] = parts;
    if (rename !== undefined && opts.from === undefined) {
      throw new ErrorException(
        `module renames (name>alias) are only supported with --from`,
      );
    }
    const moduleName = rename ?? canonical;

    if (module.modules.find((m: any) => m.name === moduleName)) {
      throw new ErrorException(`module ${moduleName} already loaded`);
    }

    let instance: Module;
    if (opts.from !== undefined) {
      instance = await loadExternalEvmlModule(
        module,
        canonical,
        moduleName,
        String(opts.from),
        interpreters,
      );
    } else {
      let ModuleConstructor;
      try {
        ({ default: ModuleConstructor } =
          await module.context.loadModule(moduleName));
      } catch (_e) {
        throw new ErrorException(`module ${moduleName} not found`);
      }
      instance = new ModuleConstructor(module.context);
    }

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

    // Publish the module's metadata so config-variable resolution (and any
    // other MODULE-space consumer) works at execution time, mirroring std.
    module.bindingsManager.setBinding(
      moduleName,
      instance.toModuleData(),
      BindingsSpace.MODULE,
      true,
    );

    module.context.modules.push(instance);
  },
});
