import type { Address, ModuleContext } from "@evmcrispr/sdk";
import { defineModule, ErrorNotFound } from "@evmcrispr/sdk";
import { getContractAddress, isAddressEqual } from "viem";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";
import { type DaoContext, getKernel, resolveApp } from "./dao";
import { buildNonceForAddress } from "./utils";
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from "./utils/acl";

export { decodeCallScript } from "./utils/evmscripts";
// Re-export utils that are used by other modules
export { batchForwarderActions } from "./utils/forwarders";

export { commands, helpers };
export const constants = {
  ANY_ENTITY,
  NO_ENTITY,
  BURN_ENTITY,
};

export default class AragonOS extends defineModule(
  "aragonos",
  commands,
  helpers,
  types,
  constants,
) {
  /** All DAOs ever connected (append-only). Used by getConnectedDAO and tests. */
  #connectedDAOs: DaoContext[];
  /** Active nesting stack (push/pop). Tracks the current DAO scope. */
  #daoStack: DaoContext[];

  constructor(context: ModuleContext) {
    super(context);

    this.#connectedDAOs = [];
    this.#daoStack = [];
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

  /** Find a DAO by name or address on the active stack. */
  findDAO(identifier: string): DaoContext | undefined {
    return this.#daoStack.find(
      (d) =>
        d.name === identifier ||
        isAddressEqual(getKernel(d).address, identifier as Address),
    );
  }

  /** All DAOs currently on the active stack. */
  get allDAOs(): DaoContext[] {
    return [...this.#daoStack];
  }

  getConnectedDAO(daoAddress: Address): DaoContext | undefined {
    return this.#connectedDAOs.find((dao) =>
      isAddressEqual(getKernel(dao).address, daoAddress),
    );
  }

  async registerNextProxyAddress(
    _identifier: string,
    daoAddress: Address,
  ): Promise<Address> {
    const connectedDAO = this.getConnectedDAO(daoAddress);

    if (!connectedDAO) {
      throw new ErrorNotFound(`couldn't found DAO ${daoAddress}`);
    }

    const kernel = resolveApp(connectedDAO, "kernel")!;
    const nonce = await buildNonceForAddress(
      kernel.address,
      await this.incrementNonce(kernel.address),
      await this.getClient(),
    );

    const addr = getContractAddress({ from: kernel.address, nonce });
    return addr;
  }
}
