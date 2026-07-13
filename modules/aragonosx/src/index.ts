import type { Address, ModuleContext } from "@evmcrispr/sdk";
import { defineModule, ErrorException } from "@evmcrispr/sdk";
import { isAddress, isAddressEqual } from "viem";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";
import { parsePluginIdentifier, resolvePluginInfo } from "./dao";
import type { DaoContext, PluginInfo } from "./types";

/** `address(type(uint160).max)` — OSx wildcard for `who`/`where`. */
export const ANY_ENTITY = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

export default class AragonOSx extends defineModule(
  "aragonosx",
  commands,
  helpers,
  types,
  { ANY_ENTITY },
) {
  /** All DAOs ever connected (append-only). */
  #connectedDAOs: DaoContext[];
  /** Active nesting stack (push/pop). Tracks the current DAO scope. */
  #daoStack: DaoContext[];
  /** Discovery cache: `chainId:address` → loaded DAO. */
  #daoCache: Map<string, DaoContext>;

  constructor(context: ModuleContext) {
    super(context);

    this.#connectedDAOs = [];
    this.#daoStack = [];
    this.#daoCache = new Map();
  }

  get connectedDAOs(): DaoContext[] {
    return this.#connectedDAOs;
  }

  get currentDAO(): DaoContext | undefined {
    return this.#daoStack.at(-1);
  }

  pushDAO(dao: DaoContext): void {
    this.#connectedDAOs.push(dao);
    this.#daoStack.push(dao);
  }

  popDAO(): void {
    this.#daoStack.pop();
  }

  /** Find a connected DAO by subdomain or address. */
  findDAO(identifier: string): DaoContext | undefined {
    return this.#connectedDAOs.find(
      (d) =>
        d.subdomain === identifier ||
        (isAddress(identifier) && isAddressEqual(d.address, identifier)),
    );
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
   * Resolve a plugin reference: an identifier (`token-voting:1`, optionally
   * `_dao:`-prefixed to target another connected DAO) or a plugin address.
   */
  resolvePlugin(
    identifierOrAddress: string,
    commandName: string,
  ): { dao: DaoContext; plugin: PluginInfo } {
    const parsed = isAddress(identifierOrAddress)
      ? undefined
      : parsePluginIdentifier(identifierOrAddress);

    const dao = parsed?.daoPrefix
      ? this.findDAO(parsed.daoPrefix)
      : this.currentDAO;

    if (!dao) {
      throw new ErrorException(
        parsed?.daoPrefix
          ? `DAO "${parsed.daoPrefix}" not found for identifier "${identifierOrAddress}"`
          : `${commandName} must be used within a "connect" command`,
      );
    }

    const plugin = resolvePluginInfo(dao, identifierOrAddress);
    if (!plugin) {
      throw new ErrorException(
        `plugin "${identifierOrAddress}" not found in DAO ${
          dao.subdomain ?? dao.address
        }`,
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
