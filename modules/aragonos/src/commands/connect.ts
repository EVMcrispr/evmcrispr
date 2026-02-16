import type {
  Action,
  Address,
  Binding,
  IPFSResolver,
  Nullable,
} from "@evmcrispr/sdk";
import {
  addressesEqual,
  BindingsSpace,
  defineCommand,
  ErrorException,
  ErrorNotFound,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
import type AragonOS from "..";
import { AragonDAO } from "../AragonDAO";
import { _aragonEns } from "../helpers/aragonEns";

const { ABI } = BindingsSpace;

const createDAO = async (
  daoAddressOrName: Address | string,
  currentDao: AragonDAO | undefined,
  client: PublicClient,
  ipfsResolver: IPFSResolver,
  ensResolver?: Nullable<Address>,
): Promise<AragonDAO> => {
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

  if (currentDao && addressesEqual(currentDao.kernel.address, daoAddress)) {
    throw new ErrorException(
      `trying to connect to an already connected DAO (${daoAddress})`,
    );
  }

  const nextNestingIndex = currentDao ? currentDao.nestingIndex + 1 : 1;

  const daoName = !isAddress(daoAddressOrName) ? daoAddressOrName : undefined;

  return AragonDAO.create(
    daoAddress,
    client,
    ipfsResolver,
    nextNestingIndex,
    daoName,
  );
};

const buildAbiBindings = (dao: AragonDAO): Binding[] => {
  const bindings: Binding[] = [];
  const seen = new Set<string>();

  dao.appCache.forEach((app) => {
    if (!seen.has(app.address)) {
      seen.add(app.address);
      bindings.push({ type: ABI, identifier: app.address, value: app.abi });
    }

    if (app.codeAddress && !seen.has(app.codeAddress)) {
      seen.add(app.codeAddress);
      bindings.push({
        type: ABI,
        identifier: app.codeAddress,
        value: app.abi,
      });
    }
  });

  return bindings;
};

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    aragonos.pushDAO(dao);
    aragonos.bindingsManager.trySetBindings(buildAbiBindings(dao));
  };
};

export default defineCommand<AragonOS>({
  name: "connect",
  args: [
    { name: "daoName", type: "dao" },
    { name: "block", type: "block" },
  ],
  async run(module, { daoName, block }, { interpreters }) {
    const { interpretNode } = interpreters;

    const dao = await createDAO(
      daoName,
      module.currentDAO,
      await module.getClient(),
      module.ipfsResolver,
      module.getConfigBinding("ensResolver"),
    );

    let actions: Action[];
    try {
      actions = (await interpretNode(
        block as import("@evmcrispr/sdk").BlockExpressionNode,
        {
          blockModule: module.contextualName,
          blockInitializer: setDAOContext(module, dao),
        },
      )) as Action[];
    } finally {
      module.popDAO();
    }

    return actions;
  },
});
