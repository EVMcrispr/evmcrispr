import type { Chain, PublicClient, Transport } from "viem";
import { getContractAddress } from "viem";
import { ErrorException, ExperimentalDisabledError } from "./errors";
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
import { experimentalDisabledMessage } from "./utils/experimental";
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
  /** Command names hidden because they are experimental and
   *  `VITE_PUBLIC_EXPERIMENTAL` is not enabled. */
  readonly experimentalCommands: string[];
  /** Helper names hidden for the same reason. */
  readonly experimentalHelpers: string[];

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
    experimentalCommands: string[] = [],
    experimentalHelpers: string[] = [],
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
    this.experimentalCommands = experimentalCommands;
    this.experimentalHelpers = experimentalHelpers;
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
      experimentalCommands: this.experimentalCommands,
      experimentalHelpers: this.experimentalHelpers,
    };
  }

  async interpretCommand(
    c: CommandExpressionNode,
    interpreters: NodesInterpreters,
  ): Promise<ReturnType<CommandFunction<this>>> {
    const commandOrLoader = this.commands[c.name];

    if (!commandOrLoader) {
      if (this.experimentalCommands.includes(c.name)) {
        throw new ExperimentalDisabledError(
          experimentalDisabledMessage("command", c.name),
        );
      }
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
      if (this.experimentalHelpers.includes(h.name)) {
        throw new ExperimentalDisabledError(
          experimentalDisabledMessage("helper", h.name),
        );
      }
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

  /**
   * Address of the next plain-CREATE deployment from `address` (nonce-derived
   * — CREATE2/CREATE3 are salt-based and need no reservation), and reserve
   * its nonce. The nonce is the on-chain transaction count, unless
   * deployments queued earlier in the script (not yet executed, so not
   * reflected in the count) advanced past it. Pass `nonce` to reserve a
   * caller-chosen one instead (e.g. a --nonce override).
   */
  async reserveNextAddress(
    address: Address,
    opts: { nonce?: bigint; chainId?: number } = {},
  ): Promise<Address> {
    const key = `${opts.chainId ?? (await this.getChainId())}:${address}`;
    let nonce: bigint;
    if (opts.nonce !== undefined) {
      nonce = opts.nonce;
      this.nonces[key] = Math.max(this.nonces[key] ?? 0, Number(nonce) + 1);
    } else {
      const client = await this.getClient();
      const txCount = await client.getTransactionCount({ address });
      const next = Math.max(txCount, this.nonces[key] ?? 0);
      this.nonces[key] = next + 1;
      nonce = BigInt(next);
    }
    return getContractAddress({ from: address, nonce });
  }

  /**
   * Like `reserveNextAddress` but read-only: the address of the CREATE
   * happening `offset` deployments after the ones already queued, reserving
   * nothing.
   */
  async predictNextAddress(
    address: Address,
    offset = 0,
    chainId?: number,
  ): Promise<Address> {
    const key = `${chainId ?? (await this.getChainId())}:${address}`;
    const client = await this.getClient();
    const txCount = await client.getTransactionCount({ address });
    return getContractAddress({
      from: address,
      nonce: BigInt(Math.max(txCount, this.nonces[key] ?? 0) + offset),
    });
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
