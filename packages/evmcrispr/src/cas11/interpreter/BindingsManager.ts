import type { AstSymbol } from 'jsymbol';
import { SymbolTable } from 'jsymbol';

export class BindingsManager {
  #env: SymbolTable<AstSymbol>;
  #mem: SymbolTable<AstSymbol>;

  constructor() {
    this.#env = new SymbolTable<AstSymbol>((s) => s.identifier);
    this.#mem = new SymbolTable<AstSymbol>((s) => s.identifier);
  }

  enterScope(): void {
    this.#env.enterScope();
    this.#mem.enterScope();
  }

  exitScope(): void {
    this.#env.exitScope();
    this.#mem.exitScope();
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setBinding(name: string, value: any, isUserVariable = false): void {
    if (isUserVariable) this.#env.add(name, value);
    else this.#mem.add(name, value);
  }
}
