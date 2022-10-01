import type { Signer } from 'ethers';

import type {
  Address,
  CommandExpressionNode,
  CommandFunction,
  Commands,
  HelperFunction,
  HelperFunctionNode,
  HelperFunctions,
  NodesInterpreters,
} from './types';
import { BindingsSpace } from './types';

import type { BindingsManager } from './BindingsManager';
import { ErrorException } from './errors';
import type { IPFSResolver } from './IPFSResolver';

export abstract class Module {
  constructor(
    readonly name: string,
    readonly bindingsManager: BindingsManager,
    readonly nonces: Record<string, number>,
    readonly commands: Commands<any>,
    readonly helpers: HelperFunctions<any>,
    readonly signer: Signer,
    readonly ipfsResolver: IPFSResolver,
    readonly alias?: string,
  ) {}

  get contextualName(): string {
    return this.alias ?? this.name;
  }

  buildConfigVar(name: string): string {
    return `$${this.name}:${name}`;
  }

  interpretCommand(
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): ReturnType<CommandFunction<this>> {
    const command = this.commands[c.name];

    if (!command) {
      throw new ErrorException(
        `command not found on module ${this.contextualName}`,
      );
    }

    return command.run(this, c, interpreters);
  }

  interpretHelper(
    h: HelperFunctionNode,
    interpreters: NodesInterpreters,
  ): ReturnType<HelperFunction<this>> {
    return this.helpers[h.name](this, h, interpreters);
  }

  getConfigBinding(name: string): any {
    return this.bindingsManager.getBindingValue(
      this.buildConfigVar(name),
      BindingsSpace.USER,
    );
  }

  getNonce(address: Address): number {
    return this.nonces[address];
  }

  incrementNonce(address: Address): number {
    if (!this.nonces[address]) {
      this.nonces[address] = 0;
    }

    return this.nonces[address]++;
  }
}
