import type { AstSymbol } from 'jsymbol';
import { SymbolTable } from 'jsymbol';

enum MemoryType {
  UserSpace,
  SystemSpace,
}

interface Binding extends AstSymbol<MemoryType> {
  value: any;
}

const { UserSpace, SystemSpace } = MemoryType;

export class BindingsManager {
  #bindings: SymbolTable<Binding>;

  constructor() {
    this.#bindings = new SymbolTable<Binding>((b) => b.identifier);
  }

  enterScope(): void {
    this.#bindings.enterScope();
  }

  exitScope(): void {
    this.#bindings.exitScope();
  }

  getBinding(name: string, isUserVariable = false): any {
    const binding = this.#bindings.lookup(
      name,
      isUserVariable ? UserSpace : SystemSpace,
    );
    return binding && binding.length ? binding[0].value : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setBinding(name: string, value: any, isUserVariable = false): void {
    this.#bindings.add({
      identifier: name,
      value,
      type: isUserVariable ? UserSpace : SystemSpace,
    });
  }
}
