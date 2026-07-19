import type { Action, Address, Nullable } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
import type AragonOS from "..";
import { type DaoContext, loadDao } from "../dao";
import { _aragonEns } from "../helpers/aragonEns";
import { buildAbiBindings } from "../utils";

const createDAO = async (
  daoAddressOrName: Address | string,
  client: PublicClient,
  ensResolver?: Nullable<Address>,
): Promise<DaoContext> => {
  let daoAddress: Address;

  if (isAddress(daoAddressOrName)) {
    daoAddress = daoAddressOrName;
  } else {
    const daoENSName = `${daoAddressOrName}.aragonid.eth`;
    const res = await _aragonEns(daoENSName, client, ensResolver);

    if (!res) {
      throw new ErrorNotFound(
        `ENS DAO name ${daoAddressOrName} couldn't be resolved`,
      );
    }

    daoAddress = res;
  }

  const daoName = !isAddress(daoAddressOrName) ? daoAddressOrName : undefined;

  return loadDao(daoAddress, client, daoName);
};

const setDAOContext = (aragonos: AragonOS, dao: DaoContext) => {
  return async () => {
    aragonos.setCurrentDAO(dao);
    const chainId = await aragonos.getChainId();
    aragonos.bindingsManager.trySetBindings(buildAbiBindings(dao, chainId));
  };
};

export default defineCommand<AragonOS>({
  name: "connect",
  description:
    "Connect to an Aragon DAO and execute commands within its context.",
  createsBatchContext: true,
  args: [
    {
      name: "daoName",
      type: "dao",
      description: "DAO kernel address or Aragonid ENS name",
    },
    {
      name: "block",
      type: "block",
      description: "Commands to execute in DAO context",
    },
  ],
  async run(module, { daoName, block }, { interpreters }) {
    const { interpretNode } = interpreters;

    if (module.currentDAO) {
      throw new ErrorException(
        'nested "connect" commands are not supported; use sequential top-level connect blocks and `set $var` to share values',
      );
    }

    const dao = await createDAO(
      daoName,
      await module.getClient(),
      module.getConfigBinding("ensResolver"),
    );

    let actions: Action[];
    try {
      actions = (await interpretNode(
        block as import("@evmcrispr/sdk").BlockExpressionNode,
        {
          blockInitializer: setDAOContext(module, dao),
          // Inherit hasActions from any enclosing batch context: reads
          // inside this block can't see the outer batch's actions either.
          batchContext: {
            name: "connect",
            hasActions: interpreters.batchContext?.hasActions ?? false,
          },
        },
      )) as Action[];
    } finally {
      module.clearCurrentDAO();
    }

    return actions;
  },
});
