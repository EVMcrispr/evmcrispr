import type { NodeResolver } from '../interpreter/Interpreter';
import type { BindingsManager } from '../interpreter/BindingsManager';

export abstract class Module {
  #name: string;
  #alias?: string;

  protected bindingsManager: BindingsManager;
  constructor(name: string, bindingsManager: BindingsManager, alias?: string) {
    this.#name = name;
    this.#alias = alias;
    this.bindingsManager = bindingsManager;
  }

  get name(): string {
    return this.#alias ? this.#alias : this.#name;
  }

  hasCommand(commandName: string): boolean {
    const key = commandName as keyof Module;

    return !!this[key] && typeof this[key] === 'function';
  }

  abstract interpretCommand(
    name: string,
    argNodeResolvers: NodeResolver[],
  ): Promise<any | void>;
}
