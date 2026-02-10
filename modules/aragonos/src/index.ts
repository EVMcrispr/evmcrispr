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
import { buildNonceForAddress } from "./utils";

export default class AragonOS extends defineModule(
  "aragonos",
  commands,
  helpers,
) {
  #connectedDAOs: AragonDAO[];

  constructor(context: ModuleContext, alias?: string) {
    super(context, alias);

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
