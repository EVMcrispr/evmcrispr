import type { Address, ModuleContext } from "@evmcrispr/sdk";
import { defineModule, ErrorException } from "@evmcrispr/sdk";
import { commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";
import { countPlugins, resolvePluginInfo } from "./dao";
import type { DaoContext, PluginInfo } from "./types";

/** `address(type(uint160).max)` — OSx wildcard for `who`/`where`. */
export const ANY_ENTITY = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

export default class AragonOSx extends defineModule(
  "aragonosx",
  commands,
  helpers,
  types,
  { ANY_ENTITY },
  configs,
) {
  /** The DAO of the enclosing `connect` block, if any. */
  #currentDAO?: DaoContext;
  /** Discovery cache: `chainId:address` → loaded DAO. */
  #daoCache: Map<string, DaoContext>;

  constructor(context: ModuleContext) {
    super(context);

    this.#daoCache = new Map();
  }

  get currentDAO(): DaoContext | undefined {
    return this.#currentDAO;
  }

  setCurrentDAO(dao: DaoContext): void {
    this.#currentDAO = dao;
  }

  clearCurrentDAO(): void {
    this.#currentDAO = undefined;
  }

  /** The current DAO, or throw when used outside a `connect` block. */
  requireCurrentDAO(commandName: string): DaoContext {
    const dao = this.currentDAO;
    if (!dao) {
      throw new ErrorException(
        `${commandName} must be used within a "connect" command`,
      );
    }
    return dao;
  }

  /**
   * Resolve a plugin reference: a repo subdomain (`token-voting`, with an
   * optional instance index for repeated installs) or a plugin address.
   */
  resolvePlugin(
    identifierOrAddress: string,
    commandName: string,
    index = 0,
  ): { dao: DaoContext; plugin: PluginInfo } {
    const dao = this.requireCurrentDAO(commandName);

    const plugin = resolvePluginInfo(dao, identifierOrAddress, index);
    if (!plugin) {
      const daoLabel = dao.subdomain ?? dao.address;
      const count = countPlugins(dao, identifierOrAddress);

      if (count > 0) {
        throw new ErrorException(
          `plugin "${identifierOrAddress}" has only ${count} instance(s) in DAO ${daoLabel} (requested index ${index})`,
        );
      }
      throw new ErrorException(
        `plugin "${identifierOrAddress}" not found in DAO ${daoLabel}`,
      );
    }

    return { dao, plugin };
  }

  getCachedDao(chainId: number, address: Address): DaoContext | undefined {
    return this.#daoCache.get(`${chainId}:${address.toLowerCase()}`);
  }

  setCachedDao(chainId: number, address: Address, dao: DaoContext): void {
    this.#daoCache.set(`${chainId}:${address.toLowerCase()}`, dao);
  }
}
