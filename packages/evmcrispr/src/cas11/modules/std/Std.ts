import type { NodeResolver } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { AragonOS } from '../AragonOS';

import { Module } from '../Module';
import type { Action, Address } from '../../../types';
import { runNodeResolvers } from '../../utils/resolvers';
import { encodeAction } from '../../utils/encoders';

export class Std extends Module {
  #modules: Module[];
  // #helpers: Record<string, Helper>;

  constructor(bindingsManager: BindingsManager, modules: Module[]) {
    super('core', bindingsManager);

    // this.#helpers = {};
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }

  hasCommand(commandName: string): boolean {
    return (
      commandName === 'load' || commandName === 'set' || commandName === 'exec'
    );
  }

  async interpretCommand(
    name: string,
    argNodeResolvers: NodeResolver[],
  ): Promise<Action | void> {
    switch (name) {
      case 'load': {
        const [moduleName, moduleAlias] = await runNodeResolvers(
          argNodeResolvers,
          [true],
        );

        return this.#load(moduleName, moduleAlias);
      }
      case 'exec': {
        const [target, signature, ...params] = await runNodeResolvers(
          argNodeResolvers,
        );

        return this.#exec(target, signature, params);
      }
      case 'set': {
        const [varName, varValue] = await runNodeResolvers(argNodeResolvers, [
          true,
        ]);
        return this.#set(varName, varValue);
      }
      default:
        this.panic(`Command ${name} not found on module Std`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  #set(name: string, value: any): void {
    this.bindingsManager.setBinding(name, value, true);
    return;
  }

  #load(name: string, alias?: string): void {
    if (this.#modules.find((m) => m.name === name)) {
      this.panic(`Module ${name} already loaded`);
    }

    if (alias) {
      const m = this.#modules.find((m) => m.alias === alias);

      if (m) {
        this.panic(`Alias already used for module ${m.name}`);
      }
    }

    switch (name) {
      case 'aragonos':
        this.#modules.push(new AragonOS(this.bindingsManager, alias));
        return;
      default:
        this.panic(`Module ${name} not found`);
    }
  }

  #exec(target: Address, signature: string, params: any[]): Action {
    return encodeAction(target, signature, params);
  }
}
