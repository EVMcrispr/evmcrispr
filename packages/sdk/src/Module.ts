import type { PublicClient } from "viem";
import { ErrorException } from "./errors";
import type {
  Address,
  CommandExpressionNode,
  CommandFunction,
  Commands,
  HelperFunction,
  HelperFunctionNode,
  HelperFunctions,
  ModuleContext,
  NodesInterpreters,
} from "./types";
import { BindingsSpace, resolveCommand, resolveHelper } from "./types";

export abstract class Module {
  readonly name: string;
  readonly commands: Commands<any>;
  readonly helpers: HelperFunctions<any>;
  readonly constants: Record<string, string>;
  readonly context: ModuleContext;
  readonly alias?: string;

  constructor(
    name: string,
    commands: Commands<any>,
    helpers: HelperFunctions<any>,
    constants: Record<string, string>,
    context: ModuleContext,
    alias?: string,
  ) {
    this.name = name;
    this.commands = commands;
    this.helpers = helpers;
    this.constants = constants;
    this.context = context;
    this.alias = alias;
  }

  // --- Convenience accessors delegating to context ---

  get bindingsManager() {
    return this.context.bindingsManager;
  }

  get nonces() {
    return this.context.nonces;
  }

  get ipfsResolver() {
    return this.context.ipfsResolver;
  }

  get contextualName(): string {
    return this.alias ?? this.name;
  }

  buildConfigVar(name: string): string {
    return `$${this.name}:${name}`;
  }

  async interpretCommand(
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): Promise<ReturnType<CommandFunction<this>>> {
    const commandOrLoader = this.commands[c.name];

    if (!commandOrLoader) {
      throw new ErrorException(
        `command not found on module ${this.contextualName}`,
      );
    }

    const command = await resolveCommand(commandOrLoader);
    return command.run(this, c, interpreters);
  }

  async interpretHelper(
    h: HelperFunctionNode,
    interpreters: NodesInterpreters,
  ): Promise<ReturnType<HelperFunction<this>>> {
    const helperOrLoader = this.helpers[h.name];
    if (!helperOrLoader) {
      throw new ErrorException(
        `helper not found on module ${this.contextualName}`,
      );
    }
    const helper = await resolveHelper(helperOrLoader);
    return helper(this, h, interpreters);
  }

  getConfigBinding(name: string): any {
    return this.bindingsManager.getBindingValue(
      this.buildConfigVar(name),
      BindingsSpace.USER,
    );
  }

  async getNonce(address: Address, chainId?: number): Promise<number> {
    chainId = chainId ?? (await this.getChainId());
    return this.nonces[`${chainId}:${address}`];
  }

  async incrementNonce(address: Address, chainId?: number): Promise<number> {
    chainId = chainId ?? (await this.getChainId());

    if (!this.nonces[`${chainId}:${address}`]) {
      this.nonces[`${chainId}:${address}`] = 0;
    }

    return this.nonces[`${chainId}:${address}`]++;
  }

  async getClient(): Promise<PublicClient> {
    return this.context.getClient();
  }

  async getChainId(): Promise<number> {
    return this.context.getChainId();
  }

  async switchChainId(chainId: number): Promise<PublicClient> {
    return this.context.switchChainId(chainId);
  }

  async getConnectedAccount(retreiveInjected?: boolean): Promise<Address> {
    return this.context.getConnectedAccount(retreiveInjected);
  }
}
