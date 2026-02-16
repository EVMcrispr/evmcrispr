import { SymbolTable } from "jsymbol";

import { ErrorException } from "./errors";
import type { Binding, BindingsSpace, RelativeBinding } from "./types";

type AllBindingsOpts = Partial<{
  onlyLocal: boolean;
  spaceFilters: BindingsSpace[];
  ignoreNullValues?: boolean;
}>;

const defaultOpts: AllBindingsOpts = {
  onlyLocal: false,
  spaceFilters: [],
};

export class BindingsManager {
  #bindings: SymbolTable<Binding>;
  #scopeModuleStack: string[];
  #metadata: Map<string, string>;

  constructor(initialBindings: Binding[] = []) {
    this.#bindings = new SymbolTable<Binding>((b) => b.identifier);
    this.#scopeModuleStack = [];
    this.#metadata = new Map();
    initialBindings.forEach((b) => {
      this.setBinding(b.identifier, b.value, b.type, false);
    });
  }

  enterScope(scopeModule?: string): void {
    const moduleValue =
      scopeModule ??
      // Use parent's scope module when none was provided
      this.getScopeModule() ??
      "std";

    this.#bindings.enterScope();
    this.#scopeModuleStack.push(moduleValue);
  }

  exitScope(): void {
    this.#bindings.exitScope();
    this.#scopeModuleStack.pop();
  }

  getBindingValue<BSpace extends BindingsSpace>(
    name: string,
    space: BSpace,
  ): RelativeBinding<BSpace>["value"] | undefined {
    return this.#getBinding(name, space)?.value;
  }

  getBinding<BSpace extends BindingsSpace>(
    identifier: string,
    type: BSpace,
  ): RelativeBinding<BSpace> | undefined {
    return this.#getBinding(identifier, type);
  }

  getAllBindings({
    onlyLocal = false,
    spaceFilters: spaces = [],
    ignoreNullValues = true,
  }: AllBindingsOpts = defaultOpts): Binding[] {
    const allBindingsMapping = new Map<string, Binding[]>();
    let currentBindings: SymbolTable<Binding> | undefined = this.#bindings;

    do {
      currentBindings.symbols.forEach((bindings, identifier) => {
        if (allBindingsMapping.has(identifier)) {
          return;
        }

        let filteredBindings = bindings;
        if (spaces.length) {
          filteredBindings = bindings.filter((b) => spaces.includes(b.type));
        }

        allBindingsMapping.set(identifier, filteredBindings);
      });
      currentBindings = currentBindings.parent;
    } while (!onlyLocal && currentBindings);

    const bindings = [...allBindingsMapping.values()].flat();

    if (ignoreNullValues) {
      return bindings.filter((b) => !!b.value);
    }
    return bindings;
  }

  getAllBindingIdentifiers(
    opts: AllBindingsOpts = defaultOpts,
  ): Binding["identifier"][] {
    return this.getAllBindings(opts).map((b) => b.identifier);
  }

  getAllBindingValues(opts: AllBindingsOpts = defaultOpts): Binding["value"][] {
    return this.getAllBindings(opts).map((b) => b.value);
  }

  getParentScope(): SymbolTable<Binding> | undefined {
    return this.#bindings.parent;
  }

  getScopeModule(): string | undefined {
    return this.#scopeModuleStack.at(-1);
  }

  getMetadata(key: string): string | undefined {
    return this.#metadata.get(key);
  }

  setMetadata(key: string, value: string): void {
    this.#metadata.set(key, value);
  }

  setBinding<BSpace extends BindingsSpace>(
    name: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: RelativeBinding<BSpace>["value"],
    memSpace: BSpace,
    isGlobal = false,
    parent?: RelativeBinding<BSpace>,
    overwrite = false,
  ): void {
    this.#setBinding(
      {
        identifier: name,
        value,
        type: memSpace,
        parent,
      } as Binding,
      isGlobal,
      overwrite,
    );
  }

  setBindings(
    bindingOrbindings: Binding | Binding[],
    isGlobal = false,
    overwrite = false,
  ): void {
    if (Array.isArray(bindingOrbindings)) {
      bindingOrbindings.forEach((b) => {
        this.#setBinding(b, isGlobal, overwrite);
      });
    } else {
      this.#setBinding(bindingOrbindings, isGlobal, overwrite);
    }
  }

  trySetBindings(bindings: Binding[]): void {
    bindings.forEach((b) => {
      if (!this.hasBinding(b.identifier, b.type)) {
        this.#bindings.add(b);
      }
    });
  }

  #setBinding(binding: Binding, isGlobal: boolean, overwrite: boolean): void {
    try {
      if (isGlobal) {
        this.#bindings.addToGlobalScope(binding);
      } else {
        this.#bindings.add(binding);
      }
    } catch (_err) {
      if (overwrite) {
        const b = this.#bindings.localLookup(binding.identifier, binding.type)!;
        b[0]!.value = binding.value;

        return;
      }

      throw new ErrorException(
        `${isGlobal ? "global" : ""} binding ${
          binding.identifier
        } already exists on current scope of ${binding.type} memory space`,
      );
    }
  }

  #getBinding<BSpace extends BindingsSpace>(
    identifier: string,
    type: BSpace,
  ): RelativeBinding<BSpace> | undefined {
    const binding = this.#bindings.lookup(identifier, type);

    return binding?.length
      ? (binding[0] as RelativeBinding<BSpace>)
      : undefined;
  }

  hasBinding(name: string, memSpace: BindingsSpace): boolean {
    return !!this.#getBinding(name, memSpace);
  }

  /** Remove all bindings belonging to the given space (across all scopes). */
  clearSpace(space: BindingsSpace): void {
    let scope: SymbolTable<Binding> | undefined = this.#bindings;
    while (scope) {
      for (const [identifier, bindings] of scope.symbols) {
        const remaining = bindings.filter((b) => b.type !== space);
        if (remaining.length === 0) {
          scope.symbols.delete(identifier);
        } else if (remaining.length !== bindings.length) {
          scope.symbols.set(identifier, remaining);
        }
      }
      scope = scope.parent;
    }
  }
}
