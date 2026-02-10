import { getContractAddress } from "viem";

import type { BindingsManager } from "../../BindingsManager";
import type { EVMcrispr } from "../../EVMcrispr";
import { ErrorNotFound } from "../../errors";
import type { IPFSResolver } from "../../IPFSResolver";
import type { Address } from "../../types";
import { BindingsSpace } from "../../types";
import { addressesEqual } from "../../utils";
import { defineModule } from "../../utils/defineModule";
import type { AragonDAO } from "./AragonDAO";
import { buildNonceForAddress } from "./utils";

export const commands = [
  "act",
  "connect",
  "forward",
  "grant",
  "install",
  "new-dao",
  "new-token",
  "revoke",
  "upgrade",
] as const;

export const helpers = ["aragonEns"] as const;

export class AragonOS extends defineModule("aragonos", commands, helpers) {
  #connectedDAOs: AragonDAO[];

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(bindingsManager, nonces, evmcrispr, ipfsResolver, alias);

    this.#connectedDAOs = [];
  }

  get connectedDAOs(): AragonDAO[] {
    return this.#connectedDAOs;
  }

  get currentDAO(): AragonDAO | undefined {
    return this.bindingsManager.getBindingValue(
      "currentDAO",
      BindingsSpace.DATA_PROVIDER,
    ) as AragonDAO | undefined;
  }

  set currentDAO(dao: AragonDAO | undefined) {
    if (!dao) {
      return;
    }

    this.bindingsManager.setBinding(
      "currentDAO",
      dao,
      BindingsSpace.DATA_PROVIDER,
    );
  }

  getConnectedDAO(daoAddress: Address): AragonDAO | undefined {
    return this.connectedDAOs.find((dao) =>
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

export { AragonOS as ModuleConstructor };
