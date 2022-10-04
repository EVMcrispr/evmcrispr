import { SymbolTable } from 'jsymbol';

import { ErrorException } from './errors';
import type { Binding, BindingsSpace, RelativeBinding } from './types';

type AllBindingsOpts = {
  onlyLocal?: boolean;
  spaceFilters?: BindingsSpace[];
};

export const isSpaceBinding =
  <BSpace extends BindingsSpace>(space: BSpace) =>
  (b: Binding): b is RelativeBinding<BSpace> =>
    b.type === space;

export class BindingsManager {
  #bindings: SymbolTable<Binding>;

  constructor(initialBindings: Binding[] = []) {
    this.#bindings = new SymbolTable<Binding>((b) => b.identifier);
    initialBindings.forEach((b) => {
      this.setBinding(b.identifier, b.value, b.type, false);
    });
  }

  enterScope(): void {
    this.#bindings.enterScope();
  }

  exitScope(): void {
    this.#bindings.exitScope();
  }

  getBindingValue<BSpace extends BindingsSpace>(
    name: string,
    space: BSpace,
  ): RelativeBinding<BSpace>['value'] | undefined {
    return this.#getBinding(name, space);
  }

  getBinding<BSpace extends BindingsSpace>(
    identifier: string,
    type: BSpace,
  ): RelativeBinding<BSpace> | undefined {
    const binding = this.#bindings.lookup(identifier, type);
    return binding?.length
      ? (binding[0] as RelativeBinding<BSpace>)
      : undefined;
  }

  getAllBindings({
    onlyLocal = false,
    spaceFilters: spaces = [],
  }: AllBindingsOpts): Binding[] {
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

    return [...allBindingsMapping.values()].flat();
  }

  getAllBindingIdentifiers(opts: AllBindingsOpts): Binding['identifier'][] {
    return this.getAllBindings(opts).map((b) => b.identifier);
  }

  getAllBindingValues(opts: AllBindingsOpts): Binding['value'][] {
    return this.getAllBindings(opts).map((b) => b.value);
  }

  setBinding<BSpace extends BindingsSpace>(
    name: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: RelativeBinding<BSpace>['value'],
    memSpace: BSpace,
    isGlobal = false,
  ): void {
    this.#setBinding(name, value, memSpace, isGlobal);
  }

  setBindings(bindings: Binding[], isGlobal = false): void {
    bindings.forEach(({ identifier, value, type }) => {
      this.#setBinding(identifier, value, type, isGlobal);
    });
  }

  mergeBindings(...bindings: Binding[]): void {
    bindings.forEach((b) => {
      if (!this.hasBinding(b.identifier, b.type)) {
        this.#bindings.add(b);
      }
    });
  }

  #setBinding(
    identifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: any,
    type: BindingsSpace,
    isGlobal: boolean,
  ): void {
    const binding: Binding = {
      identifier: identifier,
      value,
      type,
    };
    try {
      if (isGlobal) {
        this.#bindings.addToGlobalScope(binding);
      } else {
        this.#bindings.add(binding);
      }
    } catch (err) {
      throw new ErrorException(
        `${
          isGlobal ? 'global' : ''
        } binding ${identifier} already exists on current scope of ${type} memory space`,
      );
    }
  }

  #getBinding<BSpace extends BindingsSpace>(
    identifier: string,
    type: BSpace,
  ): RelativeBinding<BSpace>['value'] | undefined {
    const binding = this.#bindings.lookup(identifier, type);

    return binding && binding.length ? binding[0].value : undefined;
  }

  hasBinding(name: string, memSpace: BindingsSpace): boolean {
    return !!this.#getBinding(name, memSpace);
  }
}
