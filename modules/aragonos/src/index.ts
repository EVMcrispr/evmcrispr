import type { Address, ModuleContext } from "@evmcrispr/sdk";
import {
  addressesEqual,
  BindingsSpace,
  defineModule,
  ErrorNotFound,
} from "@evmcrispr/sdk";
import { getContractAddress } from "viem";
import { commands, helpers } from "./_generated";
import type { AragonDAO } from "./AragonDAO";
import { types } from "./argTypes";
import { buildNonceForAddress } from "./utils";
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from "./utils/acl";

export { decodeCallScript } from "./utils/evmscripts";
// Re-export utils that are used by other modules
export { batchForwarderActions } from "./utils/forwarders";

export default class AragonOS extends defineModule(
  "aragonos",
  commands,
  helpers,
  types,
  {
    ANY_ENTITY,
    NO_ENTITY,
    BURN_ENTITY,
  },
) {
  /** All DAOs ever connected (append-only). Used by getConnectedDAO and tests. */
  #connectedDAOs: AragonDAO[];
  /** Active nesting stack (push/pop). Tracks the current DAO scope. */
  #daoStack: AragonDAO[];

  constructor(context: ModuleContext, alias?: string) {
    super(context, alias);

    this.#connectedDAOs = [];
    this.#daoStack = [];
  }

  get connectedDAOs(): AragonDAO[] {
    return this.#connectedDAOs;
  }

  get currentDAO(): AragonDAO | undefined {
    return this.#daoStack.at(-1);
  }

  pushDAO(dao: AragonDAO): void {
    this.#connectedDAOs.push(dao);
    this.#daoStack.push(dao);
  }

  popDAO(): void {
    this.#daoStack.pop();
  }

  /** Find a DAO by name or address on the active stack. */
  findDAO(identifier: string): AragonDAO | undefined {
    return this.#daoStack.find(
      (d) =>
        d.name === identifier ||
        addressesEqual(d.kernel.address, identifier as Address),
    );
  }

  /** All DAOs currently on the active stack. */
  get allDAOs(): AragonDAO[] {
    return [...this.#daoStack];
  }

  getConnectedDAO(daoAddress: Address): AragonDAO | undefined {
    return this.#connectedDAOs.find((dao) =>
      addressesEqual(dao.kernel.address, daoAddress),
    );
  }

  async registerNextProxyAddress(
    identifier: string,
    daoAddress: Address,
  ): Promise<Address> {
    const connectedDAO = this.getConnectedDAO(daoAddress);

    if (!connectedDAO) {
      throw new ErrorNotFound(`couldn't found DAO ${daoAddress}`);
    }

    const kernel = connectedDAO.resolveApp("kernel")!;
    const nonce = await buildNonceForAddress(
      kernel.address,
      await this.incrementNonce(kernel.address),
      await this.getClient(),
    );

    const addr = getContractAddress({ from: kernel.address, nonce });
    this.bindingsManager.setBinding(identifier, addr, BindingsSpace.ADDR);
    return addr;
  }
}
