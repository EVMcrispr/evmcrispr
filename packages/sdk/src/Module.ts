import type { PublicClient, Transport } from "viem";
import { ErrorException } from "./errors";
import type {
  Address,
  CommandExpressionNode,
  CommandFunction,
  Commands,
  HelperArgDefEntry,
  HelperFunction,
  HelperFunctionNode,
  HelperFunctions,
  ModuleContext,
  NodesInterpreters,
} from "./types";
import { BindingsSpace, resolveCommand, resolveHelper } from "./types";
import type { ArgType, CustomArgTypes } from "./utils/schema";

export abstract class Module {
  readonly name: string;
  readonly commands: Commands<any>;
  readonly helpers: HelperFunctions<any>;
  readonly helperReturnTypes: Record<string, ArgType>;
  readonly helperHasArgs: Record<string, boolean>;
  readonly helperArgDefs: Record<string, HelperArgDefEntry[]>;
  readonly helperDescriptions: Record<string, string>;
  readonly constants: Record<string, string>;
  readonly types: CustomArgTypes;
  readonly context: ModuleContext;
  readonly alias?: string;

  constructor(
    name: string,
    commands: Commands<any>,
    helpers: HelperFunctions<any>,
    helperReturnTypes: Record<string, ArgType>,
    helperHasArgs: Record<string, boolean>,
    helperArgDefs: Record<string, HelperArgDefEntry[]>,
    helperDescriptions: Record<string, string>,
    constants: Record<string, string>,
    types: CustomArgTypes,
    context: ModuleContext,
    alias?: string,
  ) {
    this.name = name;
    this.commands = commands;
    this.helpers = helpers;
    this.helperReturnTypes = helperReturnTypes;
    this.helperHasArgs = helperHasArgs;
    this.helperArgDefs = helperArgDefs;
    this.helperDescriptions = helperDescriptions;
    this.constants = constants;
    this.types = types;
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

  getTransport(chainId: number): Transport {
    return this.context.getTransport(chainId);
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
