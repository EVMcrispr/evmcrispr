import type { BindingsManager } from "../BindingsManager";
import type { EVMcrispr } from "../EVMcrispr";
import type { IPFSResolver } from "../IPFSResolver";
import { Module } from "../Module";
import type { Commands, HelperFunctions, IModuleConstructor } from "../types";

/**
 * Create lazy command loaders following the convention:
 *   `src/modules/{moduleName}/commands/{commandName}.ts`
 */
export function createCommandLoaders<M extends Module = Module>(
  moduleName: string,
  names: readonly string[],
): Commands<M> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      () =>
        import(`../modules/${moduleName}/commands/${name}.ts`).then(
          (m) => m.default,
        ),
    ]),
  ) as Commands<M>;
}

/**
 * Create lazy helper loaders following the convention:
 *   `src/modules/{moduleName}/helpers/{helperName}.ts`
 */
export function createHelperLoaders<M extends Module = Module>(
  moduleName: string,
  names: readonly string[],
): HelperFunctions<M> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      () =>
        import(`../modules/${moduleName}/helpers/${name}.ts`).then(
          (m) => m.default,
        ),
    ]),
  ) as HelperFunctions<M>;
}

/**
 * Create a module class with the given name, commands, and helpers.
 * @param name - The name of the module.
 * @param commands - The commands of the module.
 * @param helpers - The helpers of the module.
 * @returns The module class.
 */
function createModuleClass<M extends Module>(
  name: string,
  commands: Commands<M>,
  helpers: HelperFunctions<M>,
): IModuleConstructor {
  return class extends Module {
    constructor(
      bindingsManager: BindingsManager,
      nonces: Record<string, number>,
      evmcrispr: EVMcrispr,
      ipfsResolver: IPFSResolver,
      alias?: string,
    ) {
      super(
        name,
        bindingsManager,
        nonces,
        commands,
        helpers,
        evmcrispr,
        ipfsResolver,
        alias,
      );
    }
  } as IModuleConstructor;
}

/**
 * All-in-one factory for simple modules that don't need a custom class.
 * Commands and helpers are resolved by convention from `./commands/` and
 * `./helpers/` sub-directories of `src/modules/{name}/`.
 */
export function defineModule(
  name: string,
  commands: readonly string[],
  helpers: readonly string[],
): IModuleConstructor {
  return createModuleClass(
    name,
    createCommandLoaders(name, commands),
    createHelperLoaders(name, helpers),
  );
}
