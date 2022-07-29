import type { Signer } from 'ethers';

import type { LazyNode } from '../interpreter/Interpreter';
import type { BindingsManager } from '../interpreter/BindingsManager';
import type { CommandFunction } from '../types';

export abstract class Module {
  name: string;
  alias?: string;

  #bindingsManager: BindingsManager;

  constructor(name: string, bindingsManager: BindingsManager, alias?: string) {
    this.name = name;
    this.alias = alias;
    this.#bindingsManager = bindingsManager;
  }

  get bindingsManager(): BindingsManager {
    return this.#bindingsManager;
  }

  abstract interpretCommand(
    name: string,
    lazyNodes: LazyNode[],
    signer?: Signer,
  ): ReturnType<CommandFunction<Module>>;

  getModuleVariable(name: string): any {
    return this.bindingsManager.getBinding(`$${this.name}.${name}`);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setModuleVariable(name: string, value: any, isGlobal = false): void {
    this.bindingsManager.setBinding(
      `$${this.name}.${name}`,
      value,
      false,
      isGlobal,
    );
  }

  panic(msg: string): void {
    throw new Error(msg);
  }
}
