import type { IModuleConstructor } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";

import { EvmlWorkspace } from "../Workspace";
import { ModuleRegistry } from "./registry";
import { EvmlScript } from "./script";
import { EvmlRaw, type EvmlValue, serializeTemplate } from "./serialize";
import type { EvmlConfig, ModuleInput } from "./types";

export interface EvmlTag {
  (strings: TemplateStringsArray, ...values: EvmlValue[]): EvmlScript;

  /** Register modules on this tag's registry (shared with derived tags).
   *  Registration only makes `load <name>` work — it does not activate
   *  the module. Returns the tag for chaining. */
  use(...modules: ModuleInput[]): EvmlTag;

  /** Derived tag with merged config; shares the module registry. */
  with(config: EvmlConfig): EvmlTag;

  /** Build a script from a plain string (files, editors, ...). */
  script(source: string): EvmlScript;

  /** Verbatim interpolation escape hatch. */
  raw(text: string): EvmlRaw;

  /** Long-lived editor/LSP session bound to this tag's registry and
   *  config. */
  workspace(overrides?: EvmlConfig): EvmlWorkspace;

  readonly registry: ModuleRegistry;
  readonly config: EvmlConfig;
}

function registerModule(registry: ModuleRegistry, input: ModuleInput): void {
  if (typeof input === "function") {
    const ctor = input as IModuleConstructor;
    if (!ctor.moduleName) {
      throw new ErrorException(
        "evml.use(...) received a module class without a moduleName static. " +
          "Define the module with defineModule(...) or pass { name, load }.",
      );
    }
    registry.register(
      ctor.moduleName,
      async () => ({ default: ctor }),
      ctor.moduleDescription,
    );
    return;
  }
  registry.register(
    input.name,
    input.load,
    input.description,
    input.experimental,
    input.chains,
  );
}

/**
 * Create an `evml` tag with its own module registry. The exported `evml`
 * singleton covers most uses; isolated tags are for tests and embedders
 * that don't want to share the global registry.
 */
export function createEvml(
  config: EvmlConfig = {},
  registry: ModuleRegistry = new ModuleRegistry(),
): EvmlTag {
  const tag = ((strings: TemplateStringsArray, ...values: EvmlValue[]) =>
    new EvmlScript(
      serializeTemplate(strings, values),
      registry,
      config,
    )) as EvmlTag;

  tag.use = (...modules: ModuleInput[]) => {
    for (const m of modules) registerModule(registry, m);
    return tag;
  };

  tag.with = (overrides: EvmlConfig) =>
    createEvml({ ...config, ...overrides }, registry);

  tag.script = (source: string) => new EvmlScript(source, registry, config);

  tag.raw = (text: string) => new EvmlRaw(text);

  tag.workspace = (overrides?: EvmlConfig) =>
    new EvmlWorkspace(registry, { ...config, ...overrides });

  Object.defineProperty(tag, "registry", { value: registry });
  Object.defineProperty(tag, "config", { value: config });

  return tag;
}

/** The default `evml` tag, backed by a process-wide module registry. */
export const evml: EvmlTag = createEvml();
