import type { BindingsManager } from '../../BindingsManager';

import { Module } from '../../Module';
import type { IPFSResolver } from '../../IPFSResolver';
import { commands } from './commands';
import { helpers } from './helpers';
import type { EVMcrispr } from '../../EVMcrispr';

export class Std extends Module {
  #modules: Module[];
  #logListeners: ((message: string, prevMessages: string[]) => void)[];
  #prevMessages: string[];

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    modules: Module[],
  ) {
    super(
      'std',
      bindingsManager,
      nonces,
      commands,
      helpers,
      evmcrispr,
      ipfsResolver,
    );

    this.#modules = modules;
    this.#logListeners = [];
    this.#prevMessages = [];
  }

  get modules(): Module[] {
    return this.#modules;
  }

  registerLogListener(
    listener: (message: string, prevMessages: string[]) => void,
  ): void {
    this.#logListeners.push(listener);
  }

  log(message: string): void {
    this.#logListeners.forEach((listener) =>
      listener(message, this.#prevMessages),
    );
    this.#prevMessages.push(message);
  }
}
