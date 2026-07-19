import type {
  BindingsManager,
  ConfigDef,
  CustomArgTypes,
  HelperArgDefEntry,
  ICommand,
  ModuleBinding,
  ModuleData,
  NoNullableBinding,
} from "@evmcrispr/sdk";
import { BindingsSpace, resolveCommand, resolveHelper } from "@evmcrispr/sdk";

const { MODULE } = BindingsSpace;

/**
 * Read-only view over the module schemas that the static analyzer needs.
 * Backed by the same `#moduleCache` BindingsManager that completions/hover
 * use, so it is fully offline: command/helper definitions are resolved via
 * local dynamic imports (`resolveCommand` / `resolveHelper`), never RPC.
 *
 * All lookups are strict per module: unqualified-name resolution (defs →
 * imports → std prelude) is the analyzer's job, not this provider's.
 */
export class ModuleSchemaProvider {
  #modules = new Map<string, ModuleData>();
  #commandCache = new Map<string, ICommand | undefined>();
  #helperBatchableCache = new Map<string, boolean | undefined>();
  readonly #registered: Set<string>;

  constructor(moduleCache: BindingsManager, registeredNames: string[]) {
    const bindings = moduleCache.getAllBindings({
      spaceFilters: [MODULE],
      ignoreNullValues: true,
    }) as NoNullableBinding<ModuleBinding>[];
    for (const { identifier, value } of bindings) {
      this.#modules.set(identifier, value);
    }
    this.#registered = new Set(registeredNames);
  }

  /** Real module names currently loaded into the cache (includes `std`). */
  loadedModuleNames(): string[] {
    return [...this.#modules.keys()];
  }

  /** Whether a module is loaded (its schema is available). */
  isLoaded(name: string): boolean {
    return this.#modules.has(name);
  }

  /** Whether a module is registered on the tag (available to `load`). */
  isRegistered(name: string): boolean {
    return this.#registered.has(name);
  }

  /** Whether a module is an opaque placeholder (external `--from` module
   *  whose contents could not be fetched) — name/arity checks are
   *  suppressed for it. */
  isOpaque(name: string): boolean {
    return !!this.#modules.get(name)?.opaque;
  }

  /** Register a script-derived module schema (inline `module` blocks and
   *  `--from` placeholders). Never overwrites a real loaded schema; returns
   *  false when the name is already taken by one. Synthetic/opaque entries
   *  (e.g. seeded by the Workspace from the same script) may be replaced. */
  addSyntheticModule(name: string, data: ModuleData): boolean {
    const existing = this.#modules.get(name);
    if (existing && !existing.synthetic && !existing.opaque) return false;
    this.#modules.set(name, data);
    return true;
  }

  /** Declared config variables of `moduleName` (empty when none/unknown). */
  configDefs(moduleName: string): ConfigDef[] {
    return this.#modules.get(moduleName)?.configs ?? [];
  }

  /** Whether `moduleName` declares config key `key`. */
  hasConfig(moduleName: string, key: string): boolean {
    return this.configDefs(moduleName).some((c) => c.name === key);
  }

  /** All loaded modules with declared configs, for near-miss suggestions. */
  allDeclaredConfigs(): Map<string, ConfigDef[]> {
    const out = new Map<string, ConfigDef[]>();
    for (const [name, mod] of this.#modules) {
      if (mod.configs?.length) out.set(name, mod.configs);
    }
    return out;
  }

  /** All module names registered on the tag (for suggestions). */
  registeredNames(): string[] {
    return [...this.#registered];
  }

  /** Command names declared by `moduleName`, used to suggest a close match
   *  for an unknown command. */
  commandNames(moduleName: string): string[] {
    return Object.keys(this.#modules.get(moduleName)?.commands ?? {});
  }

  /** Helper/constant names declared by `moduleName` (for suggestions). */
  helperNames(moduleName: string): string[] {
    const mod = this.#modules.get(moduleName);
    if (!mod) return [];
    return [...Object.keys(mod.helpers), ...Object.keys(mod.constants ?? {})];
  }

  /** Sync check: does `moduleName` declare a command called `cmdName`?
   *  Strict — no std fallback; unqualified resolution is the caller's job. */
  hasCommand(moduleName: string, cmdName: string): boolean {
    const mod = this.#modules.get(moduleName);
    return !!mod && cmdName in mod.commands;
  }

  /** Resolve a command's full definition (argDefs/optDefs/batchable/…).
   *  Strict per module. Memoized. Returns `undefined` when the command
   *  doesn't exist or fails to load. */
  async getCommand(
    moduleName: string,
    cmdName: string,
  ): Promise<ICommand | undefined> {
    const key = `${moduleName}:${cmdName}`;
    if (this.#commandCache.has(key)) return this.#commandCache.get(key);

    const loader = this.#modules.get(moduleName)?.commands[cmdName];
    let resolved: ICommand | undefined;
    if (loader) {
      try {
        resolved = await resolveCommand(loader);
      } catch {
        resolved = undefined;
      }
    }
    this.#commandCache.set(key, resolved);
    return resolved;
  }

  /** Whether `moduleName` declares helper `name`. */
  hasHelper(moduleName: string, name: string): boolean {
    const mod = this.#modules.get(moduleName);
    return !!mod && name in mod.helpers;
  }

  /** Whether `moduleName` declares constant `name`. */
  hasConstant(moduleName: string, name: string): boolean {
    const mod = this.#modules.get(moduleName);
    return !!mod?.constants && name in mod.constants;
  }

  /** Static arg definitions for `moduleName`'s helper `name`. */
  getHelperArgDefs(
    moduleName: string,
    name: string,
  ): HelperArgDefEntry[] | undefined {
    const mod = this.#modules.get(moduleName);
    if (!mod || !(name in mod.helpers)) return undefined;
    return mod.helperArgDefs?.[name];
  }

  /** Resolve a helper's `batchable` flag (requires loading the helper fn).
   *  Memoized. `undefined` when unknown/unresolvable. */
  async getHelperBatchable(
    moduleName: string,
    name: string,
  ): Promise<boolean | undefined> {
    const key = `${moduleName}:${name}`;
    if (this.#helperBatchableCache.has(key)) {
      return this.#helperBatchableCache.get(key);
    }
    let batchable: boolean | undefined;
    const loader = this.#modules.get(moduleName)?.helpers[name];
    if (loader) {
      try {
        const fn = await resolveHelper(loader);
        batchable = (fn as { batchable?: boolean }).batchable;
      } catch {
        batchable = undefined;
      }
    }
    this.#helperBatchableCache.set(key, batchable);
    return batchable;
  }

  /** Merged custom arg types across all loaded modules (for type checks). */
  customTypes(): CustomArgTypes {
    const merged: CustomArgTypes = {};
    for (const mod of this.#modules.values()) {
      if (mod.types) Object.assign(merged, mod.types);
    }
    return merged;
  }
}
