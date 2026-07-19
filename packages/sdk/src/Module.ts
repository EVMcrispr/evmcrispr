import type { Chain, PublicClient, Transport } from "viem";
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
  ModuleData,
  NodesInterpreters,
} from "./types";
import { BindingsSpace, resolveCommand, resolveHelper } from "./types";
import { substituteConfigDefault } from "./utils/configVars";
import type { ArgType, ConfigDef, CustomArgTypes } from "./utils/schema";

export abstract class Module {
  readonly name: string;
  readonly commands: Commands<any>;
  readonly helpers: HelperFunctions<any>;
  readonly helperReturnTypes: Record<string, ArgType>;
  readonly helperHasArgs: Record<string, boolean>;
  readonly helperArgDefs: Record<string, HelperArgDefEntry[]>;
  readonly helperDescriptions: Record<string, string>;
  readonly commandDescriptions: Record<string, string>;
  readonly constants: Record<string, string>;
  readonly types: CustomArgTypes;
  readonly context: ModuleContext;
  readonly configs: ConfigDef[];

  constructor(
    name: string,
    commands: Commands<any>,
    helpers: HelperFunctions<any>,
    helperReturnTypes: Record<string, ArgType>,
    helperHasArgs: Record<string, boolean>,
    helperArgDefs: Record<string, HelperArgDefEntry[]>,
    helperDescriptions: Record<string, string>,
    commandDescriptions: Record<string, string>,
    constants: Record<string, string>,
    types: CustomArgTypes,
    context: ModuleContext,
    configs: ConfigDef[] = [],
  ) {
    this.name = name;
    this.commands = commands;
    this.helpers = helpers;
    this.helperReturnTypes = helperReturnTypes;
    this.helperHasArgs = helperHasArgs;
    this.helperArgDefs = helperArgDefs;
    this.helperDescriptions = helperDescriptions;
    this.commandDescriptions = commandDescriptions;
    this.constants = constants;
    this.types = types;
    this.context = context;
    this.configs = configs;
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

  buildConfigVar(name: string): string {
    return `$${this.name}:${name}`;
  }

  /** Snapshot of this module's metadata for MODULE-space bindings (editor
   *  cache and runtime config resolution). */
  toModuleData(): ModuleData {
    return {
      commands: this.commands,
      helpers: this.helpers,
      helperReturnTypes: this.helperReturnTypes,
      helperHasArgs: this.helperHasArgs,
      helperArgDefs: this.helperArgDefs,
      helperDescriptions: this.helperDescriptions,
      commandDescriptions: this.commandDescriptions,
      constants: this.constants,
      types: this.types,
      configs: this.configs,
    };
  }

  async interpretCommand(
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): Promise<ReturnType<CommandFunction<this>>> {
    const commandOrLoader = this.commands[c.name];

    if (!commandOrLoader) {
      throw new ErrorException(`command not found on module ${this.name}`);
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
      throw new ErrorException(`helper not found on module ${this.name}`);
    }
    const helper = await resolveHelper(helperOrLoader);
    return helper(this, h, interpreters);
  }

  /** Read this module's own declared config variable: the `set` value if
   *  present, otherwise the declared default (with `{chainId}`-style
   *  placeholders substituted from `vars`). Throws on undeclared keys so
   *  module-code typos surface immediately. */
  getConfigBinding(name: string, vars?: Record<string, string | number>): any {
    const def = this.configs.find((c) => c.name === name);
    if (!def) {
      throw new ErrorException(
        `module ${this.name} declares no config variable "${name}" — declare it in src/configs.ts`,
      );
    }
    const set = this.bindingsManager.getBindingValue(
      this.buildConfigVar(name),
      BindingsSpace.USER,
    );
    if (set !== undefined && set !== null) return set;
    if (def.default === undefined) return undefined;
    return substituteConfigDefault(def.default, this.name, name, vars);
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

  async getChain(): Promise<Chain | undefined> {
    return this.context.getChain();
  }

  switchChainId(chainId: number): PublicClient {
    return this.context.switchChainId(chainId);
  }

  async getConnectedAccount(retreiveInjected?: boolean): Promise<Address> {
    return this.context.getConnectedAccount(retreiveInjected);
  }
}
