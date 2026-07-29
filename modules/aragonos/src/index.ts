import type { Address } from "@evmcrispr/sdk";
import { defineModule } from "@evmcrispr/sdk";
import { getContractAddress } from "viem";
import { commands, configs, helpers } from "./_generated";
import { types } from "./argTypes";
import type { DaoContext } from "./dao";
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
  configs,
) {
  /** The DAO of the enclosing `connect` block, if any. */
  #currentDAO?: DaoContext;

  get currentDAO(): DaoContext | undefined {
    return this.#currentDAO;
  }

  setCurrentDAO(dao: DaoContext): void {
    this.#currentDAO = dao;
  }

  clearCurrentDAO(): void {
    this.#currentDAO = undefined;
  }

  async registerNextProxyAddress(kernelAddress: Address): Promise<Address> {
    const nonce = await buildNonceForAddress(
      kernelAddress,
      await this.incrementNonce(kernelAddress),
      await this.getClient(),
    );

    return getContractAddress({ from: kernelAddress, nonce });
  }
}
