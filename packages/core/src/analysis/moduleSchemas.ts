import type {
  BindingsManager,
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
 * All lookups are keyed by a module's *real* name (`aragonos`), not its
 * script alias (`ar`); callers translate aliases first.
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

  /** All module names registered on the tag (for suggestions). */
  registeredNames(): string[] {
    return [...this.#registered];
  }

  /** Command names available for `moduleName` (its own plus std's), used to
   *  suggest a close match for an unknown command. */
  commandNames(moduleName: string): string[] {
    const names = new Set<string>();
    for (const key of Object.keys(
      this.#modules.get(moduleName)?.commands ?? {},
    )) {
      names.add(key);
    }
    for (const key of Object.keys(this.#modules.get("std")?.commands ?? {})) {
      names.add(key);
    }
    return [...names];
  }

  /** Sync check: does `moduleName` (or `std` as a fallback) declare a
   *  command called `cmdName`? */
  hasCommand(moduleName: string, cmdName: string): boolean {
    const mod = this.#modules.get(moduleName);
    if (mod && cmdName in mod.commands) return true;
    const std = this.#modules.get("std");
    return !!std && cmdName in std.commands;
  }

  /** Resolve a command's full definition (argDefs/optDefs/batchable/…),
   *  mirroring the runtime's std fallback. Memoized. Returns `undefined`
   *  when the command doesn't exist or fails to load. */
  async getCommand(
    moduleName: string,
    cmdName: string,
  ): Promise<ICommand | undefined> {
    const key = `${moduleName}:${cmdName}`;
    if (this.#commandCache.has(key)) return this.#commandCache.get(key);

    let loader = this.#modules.get(moduleName)?.commands[cmdName];
    if (!loader) {
      // Runtime falls back to std for commands missing on the module.
      loader = this.#modules.get("std")?.commands[cmdName];
    }
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

  /** Whether any loaded module (including `std`) declares helper `name`. */
  hasHelper(name: string): boolean {
    for (const mod of this.#modules.values()) {
      if (name in mod.helpers) return true;
    }
    return false;
  }

  /** Static arg definitions for a helper, from the first loaded module that
   *  declares it. No resolution needed — these are stored eagerly. */
  getHelperArgDefs(name: string): HelperArgDefEntry[] | undefined {
    for (const mod of this.#modules.values()) {
      if (name in mod.helpers) return mod.helperArgDefs?.[name];
    }
    return undefined;
  }

  /** Resolve a helper's `batchable` flag (requires loading the helper fn).
   *  Memoized. `undefined` when unknown/unresolvable. */
  async getHelperBatchable(name: string): Promise<boolean | undefined> {
    if (this.#helperBatchableCache.has(name)) {
      return this.#helperBatchableCache.get(name);
    }
    let batchable: boolean | undefined;
    for (const mod of this.#modules.values()) {
      const loader = mod.helpers[name];
      if (!loader) continue;
      try {
        const fn = await resolveHelper(loader);
        batchable = (fn as { batchable?: boolean }).batchable;
      } catch {
        batchable = undefined;
      }
      break;
    }
    this.#helperBatchableCache.set(name, batchable);
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
