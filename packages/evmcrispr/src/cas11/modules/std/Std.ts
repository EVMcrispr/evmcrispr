import type { LazyNode } from '../../interpreter/Interpreter';
import type { BindingsManager } from '../../interpreter/BindingsManager';

import { Module } from '../Module';
import { IPFSResolver } from '../../../IPFSResolver';
import { exec, load, set } from './commands';
import type { CommandFunction } from '../../types';

export class Std extends Module {
  #modules: Module[];
  #ipfsResolver: IPFSResolver;
  // #helpers: Record<string, Helper>;

  constructor(bindingsManager: BindingsManager, modules: Module[]) {
    super('core', bindingsManager);

    // this.#helpers = {};
    this.#ipfsResolver = new IPFSResolver();
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }

  get ipfsResolver(): IPFSResolver {
    return this.#ipfsResolver;
  }

  hasCommand(commandName: string): boolean {
    return (
      commandName === 'load' || commandName === 'set' || commandName === 'exec'
    );
  }

  async interpretCommand(
    name: string,
    lazyNodes: LazyNode[],
  ): ReturnType<CommandFunction<Std>> {
    switch (name) {
      case 'load':
        return load(this, lazyNodes);
      case 'exec':
        return exec(this, lazyNodes);
      case 'set':
        return set(this, lazyNodes);
      default:
        this.panic(`Command ${name} not found on module Std`);
    }
  }
}
