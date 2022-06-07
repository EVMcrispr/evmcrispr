import type { NodeResolver } from '../interpreter/Interpreter';
import type { BindingsManager } from '../interpreter/BindingsManager';

import { AragonOS } from './AragonOS';

import { Module } from './Module';

export class Core extends Module {
  #modules: Module[];

  constructor(bindingsManager: BindingsManager, modules: Module[]) {
    super('core', bindingsManager);

    this.#modules = modules;
  }

  async interpretCommand(
    name: string,
    argNodeResolvers: NodeResolver[],
  ): Promise<any | void> {
    if (!this.hasCommand(name)) {
      return Promise.resolve(null);
    }

    const args = await Promise.all(argNodeResolvers.map((r) => r()));

    // TODO: refactor to dynamic imports
    switch (name) {
      case 'set': {
        const [varName, varValue] = args;
        this.#set(varName, varValue);
        break;
      }
      case 'load': {
        const [moduleName, moduleAlias] = args;
        this.#load(moduleName, moduleAlias);
        break;
      }
    }

    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  #set(name: string, value: any): void {
    this.bindingsManager.setBinding(name, value, true);
  }

  async #load(name: string, alias?: string): Promise<void> {
    switch (name) {
      case 'aragonos':
        this.#modules.push(new AragonOS(this.bindingsManager, alias));
        return;
      default:
        return;
    }
  }
}
