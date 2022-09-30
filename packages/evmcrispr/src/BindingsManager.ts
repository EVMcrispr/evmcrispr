import type { AstSymbol } from 'jsymbol';
import { SymbolTable } from 'jsymbol';

import { ErrorException } from './errors';

export enum BindingsSpace {
  USER = 'USER',
  ADDR = 'ADDR',
  ABI = 'ABI',
  DATA_PROVIDER = 'DATA_PROVIDER',
  MODULE = 'MODULE',
  INTERPRETER = 'INTERPRETER',
}

export interface Binding extends AstSymbol<string> {
  type: string;
  value: any;
}

export class BindingsManager {
  #bindings: SymbolTable<Binding>;

  constructor(initialBindings: Binding[] = []) {
    this.#bindings = new SymbolTable<Binding>((b) => b.identifier);
    initialBindings.forEach((b) => {
      this.setCustomBinding(b.identifier, b.value, b.type, false);
    });
  }

  enterScope(): void {
    this.#bindings.enterScope();
  }

  exitScope(): void {
    this.#bindings.exitScope();
  }

  getBinding(name: string, space: BindingsSpace): any {
    return this.#getBinding(name, space);
  }

  getCustomBinding(name: string, space: string): any {
    return this.#getBinding(name, space);
  }

  getAllBindings(): Map<string, Binding[]> {
    return this.#bindings.symbols;
  }

  getBindingsFromSpaces(...spaces: BindingsSpace[]): Binding[] {
    const bindings: Binding[] = [];

    this.getAllBindings().forEach((binding) => {
      bindings.push(
        ...binding.filter((b) =>
          spaces.includes(BindingsSpace[b.type as keyof typeof BindingsSpace]),
        ),
      );
    });

    return bindings;
  }

  setBinding(
    name: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: any,
    memSpace: BindingsSpace,
    isGlobal = false,
  ): void {
    this.#setBinding(name, value, memSpace, isGlobal);
  }

  setBindings(bindings: Binding[], isGlobal = false): void {
    bindings.forEach(({ identifier, value, type }) =>
      this.#setBinding(identifier, value, type, isGlobal),
    );
  }

  setCustomBinding(
    name: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: any,
    type: string,
    isGlobal = false,
  ): void {
    this.#setBinding(name, value, type, isGlobal);
  }

  #setBinding(
    identifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    value: any,
    type: string,
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

  #getBinding(identifier: string, type: string): any {
    const binding = this.#bindings.lookup(identifier, type);

    return binding && binding.length ? binding[0].value : undefined;
  }

  hasBinding(name: string, memSpace: BindingsSpace): boolean {
    return !!this.#getBinding(name, memSpace);
  }
}
