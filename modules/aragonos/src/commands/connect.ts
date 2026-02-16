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
import {
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
  INITIAL_APP_INDEX,
} from "../utils";

const { ABI, ADDR } = BindingsSpace;

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

const buildDAOBindings = (
  dao: AragonDAO,
  addPrefixedBindings = true,
  omitRedudantIdentifier = false,
): Binding[] => {
  const daoBindings: Binding[] = [];

  dao.appCache.forEach((app, appIdentifier) => {
    const finalAppIdentifier = formatAppIdentifier(appIdentifier);
    const bindingIdentifiers: string[] = [];

    if (!omitRedudantIdentifier && appIdentifier.endsWith(INITIAL_APP_INDEX)) {
      bindingIdentifiers.push(appIdentifier);
    }

    bindingIdentifiers.push(finalAppIdentifier);

    if (addPrefixedBindings) {
      bindingIdentifiers.push(
        createDaoPrefixedIdentifier(
          finalAppIdentifier,
          dao.name ?? dao.kernel.address,
        ),
      );
    }

    for (const identifier of bindingIdentifiers) {
      daoBindings.push({
        type: ADDR,
        identifier,
        value: app.address,
      });
    }
    daoBindings.push({
      type: ABI,
      identifier: app.address,
      value: app.abi,
    });

    if (
      !daoBindings.find(
        (b) => b.identifier === app.codeAddress && b.type === ABI,
      )
    ) {
      daoBindings.push({
        type: ABI,
        identifier: app.codeAddress,
        value: app.abi,
      });
    }
  });

  return daoBindings;
};

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    const bindingsManager = aragonos.bindingsManager;

    aragonos.pushDAO(dao);

    const daoBindings = buildDAOBindings(dao);

    const nonAbiBindings = daoBindings.filter((b) => b.type !== ABI);
    const abiBindings = daoBindings.filter((b) => b.type === ABI);

    bindingsManager.setBindings(nonAbiBindings);
    bindingsManager.trySetBindings(abiBindings);
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
