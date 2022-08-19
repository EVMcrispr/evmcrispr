import type { Signer } from 'ethers';

import type { Address } from '../..';

import type { BindingsManager } from '../interpreter/BindingsManager';
import { BindingsSpace } from '../interpreter/BindingsManager';
import { Interpreter } from '../interpreter/Interpreter';
import type {
  CommandExpressionNode,
  CommandFunction,
  HelperFunction,
  HelperFunctionNode,
} from '../types';
import type {
  CommandFunctions,
  HelperFunctions,
  NodesInterpreters,
} from '../types/modules';

const buildConfigVar = (moduleName: string, name: string): string =>
  `$${moduleName}:${name}`;

export abstract class Module {
  constructor(
    readonly name: string,
    readonly bindingsManager: BindingsManager,
    readonly nonces: Record<string, number>,
    readonly commands: CommandFunctions<any>,
    readonly helpers: HelperFunctions<any>,
    readonly signer: Signer,
    readonly alias?: string,
  ) {}

  get contextualName(): string {
    return this.alias ?? this.name;
  }

  interpretCommand(
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): ReturnType<CommandFunction<this>> {
    const command = this.commands[c.name];

    if (!command) {
      Interpreter.panic(
        c,
        `command not found on module ${this.contextualName}`,
      );
    }

    return command(this, c, interpreters);
  }

  interpretHelper(
    h: HelperFunctionNode,
    interpreters: NodesInterpreters,
  ): ReturnType<HelperFunction<this>> {
    return this.helpers[h.name](this, h, interpreters);
  }

  getConfigBinding(name: string): any {
    return this.bindingsManager.getBinding(
      buildConfigVar(this.contextualName, name),
      BindingsSpace.USER,
    );
  }

  getModuleBinding(name: string): any {
    return this.bindingsManager.getCustomBinding(name, this.contextualName);
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

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setModuleBinding(name: string, value: any, isGlobal = false): void {
    this.bindingsManager.setCustomBinding(
      name,
      value,
      this.contextualName,
      isGlobal,
    );
  }
}
