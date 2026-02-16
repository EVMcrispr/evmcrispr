import type {
  Action,
  Address,
  Binding,
  IPFSResolver,
  Nullable,
} from "@evmcrispr/sdk";
import {
  abiBindingKey,
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

const buildAbiBindings = (dao: AragonDAO, chainId: number): Binding[] => {
  const bindings: Binding[] = [];
  const seen = new Set<string>();

  dao.appCache.forEach((app) => {
    const addrKey = abiBindingKey(chainId, app.address);
    if (!seen.has(addrKey)) {
      seen.add(addrKey);
      bindings.push({ type: ABI, identifier: addrKey, value: app.abi });
    }

    if (app.codeAddress) {
      const codeKey = abiBindingKey(chainId, app.codeAddress);
      if (!seen.has(codeKey)) {
        seen.add(codeKey);
        bindings.push({
          type: ABI,
          identifier: codeKey,
          value: app.abi,
        });
      }
    }
  });

  return bindings;
};

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    aragonos.pushDAO(dao);
    const chainId = await aragonos.getChainId();
    aragonos.bindingsManager.trySetBindings(buildAbiBindings(dao, chainId));
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
