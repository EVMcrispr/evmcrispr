import type { PublicClient } from "viem";
import type { BindingsManager } from "./BindingsManager";
import type { EVMcrispr } from "./EVMcrispr";
import { ErrorException } from "./errors";
import type { IPFSResolver } from "./IPFSResolver";
import type {
  Address,
  CommandExpressionNode,
  CommandFunction,
  Commands,
  HelperFunction,
  HelperFunctionNode,
  HelperFunctions,
  NodesInterpreters,
} from "./types";
import { BindingsSpace, resolveCommand, resolveHelper } from "./types";

export abstract class Module {
  constructor(
    readonly name: string,
    readonly bindingsManager: BindingsManager,
    readonly nonces: Record<string, number>,
    readonly commands: Commands<any>,
    readonly helpers: HelperFunctions<any>,
    readonly evmcrispr: EVMcrispr,
    readonly ipfsResolver: IPFSResolver,
    readonly alias?: string,
  ) {}

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
    return this.evmcrispr.getClient();
  }

  async getChainId(): Promise<number> {
    return this.evmcrispr.getChainId();
  }

  async switchChainId(chainId: number): Promise<PublicClient> {
    return this.evmcrispr.switchChainId(chainId);
  }

  async getConnectedAccount(retreiveInjected?: boolean): Promise<Address> {
    return this.evmcrispr.getConnectedAccount(retreiveInjected);
  }
}
