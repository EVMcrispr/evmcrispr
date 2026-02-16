import type {
  AbiBinding,
  Action,
  Address,
  AddressBinding,
  Binding,
  IPFSResolver,
  Nullable,
} from "@evmcrispr/sdk";
import {
  addressesEqual,
  BindingsSpace,
  beforeOrEqualNode,
  defineCommand,
  ErrorException,
  ErrorNotFound,
  interpretNodeSync,
  isAddressNodishType,
  tryAndCacheNotFound,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
import type AragonOS from "..";
import { AragonDAO, isAragonDAO } from "../AragonDAO";
import { _aragonEns } from "../helpers/aragonEns";
import type { App, AppIdentifier } from "../types";
import {
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
  INITIAL_APP_INDEX,
} from "../utils";

// DATA_PROVIDER is still used by the eager execution / completions path,
// which relies on scope-aware bindings for nested DAO tracking.
// It will be fully removed when the completions system is refactored.
const { ABI, ADDR, DATA_PROVIDER, USER } = BindingsSpace;

const buildAppBindings = (
  appIdentifier: AppIdentifier,
  app: App,
  dao: AragonDAO,
  addPrefixedBindings: boolean,
  omitRedudantIdentifier: boolean,
): (AbiBinding | AddressBinding)[] => {
  const bindingIdentifiers = [];
  const finalAppIdentifier = formatAppIdentifier(appIdentifier);

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

  const appAddressBindings = bindingIdentifiers.map<AddressBinding>(
    (identifier) => ({
      type: ADDR,
      identifier,
      value: app.address,
    }),
  );
  const appAbiBinding: AbiBinding = {
    type: ABI,
    identifier: app.address,
    value: app.abi,
  };

  return [...appAddressBindings, appAbiBinding];
};

const buildDAOBindings = (
  dao: AragonDAO,
  addPrefixedBindings = true,
  omitRedudantIdentifier = false,
): Binding[] => {
  const daoBindings: Binding[] = [];

  dao.appCache.forEach((app, appIdentifier) => {
    const appBindings = buildAppBindings(
      appIdentifier,
      app,
      dao,
      addPrefixedBindings,
      omitRedudantIdentifier,
    );

    // There could be the case of having multiple same-version apps on the DAO
    // so avoid setting the same binding twice
    if (!appBindings.find((b) => b.identifier === app.codeAddress)) {
      appBindings.push({
        type: ABI,
        identifier: app.codeAddress,
        value: app.abi,
      });
    }
    daoBindings.push(...appBindings);
  });

  return daoBindings;
};

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

  // Allow us to keep track of connected DAOs inside nested 'connect' commands
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

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    const bindingsManager = aragonos.bindingsManager;

    // Push DAO onto the module's stack (replaces DATA_PROVIDER bindings)
    aragonos.pushDAO(dao);

    const daoBindings = buildDAOBindings(dao);

    const nonAbiBindings = daoBindings.filter((b) => b.type !== ABI);
    const abiBindings = daoBindings.filter((b) => b.type === ABI);

    bindingsManager.setBindings(nonAbiBindings);
    /**
     * We could have multiple apps from the same repo version
     * so try to set the ABI if doesn't exists
     */
    bindingsManager.trySetBindings(abiBindings);
  };
};

export default defineCommand<AragonOS>({
  name: "connect",
  args: [
    { name: "daoName", type: "string" },
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
  async runEagerExecution(
    c,
    cache,
    { ipfsResolver, client },
    caretPos,
    closestCommandToCaret,
  ) {
    const daoNode = c.args[0];

    if (
      !daoNode ||
      beforeOrEqualNode(daoNode, caretPos) ||
      !isAddressNodishType(daoNode)
    ) {
      return;
    }

    const daoAddress = interpretNodeSync(daoNode, cache);

    const daoNameOrAddress =
      daoAddress && isAddress(daoAddress) ? daoAddress : daoNode.value;

    const cachedDAOBinding = cache.getBinding(daoNameOrAddress, DATA_PROVIDER);

    if (cachedDAOBinding) {
      const cachedDAO = cachedDAOBinding.value;
      if (!cachedDAO || !isAragonDAO(cachedDAO)) {
        return;
      }

      const clonedDAO = cachedDAO.clone();
      return (eagerBindingsManager) => {
        const upperDAOBinding = eagerBindingsManager.getBinding(
          "currentDAO",
          DATA_PROVIDER,
        );

        eagerBindingsManager.enterScope(c.module);

        // DATA_PROVIDER bindings for completions DAO tracking
        const dpBindings: Binding[] = [
          {
            type: DATA_PROVIDER,
            identifier: clonedDAO.name ?? clonedDAO.kernel.address,
            value: clonedDAO,
          },
          {
            type: DATA_PROVIDER,
            identifier: "currentDAO",
            value: clonedDAO,
            parent: upperDAOBinding ?? undefined,
          },
        ];
        eagerBindingsManager.setBindings(dpBindings);

        const appBindings = buildDAOBindings(
          clonedDAO,
          !closestCommandToCaret,
          true,
        );
        eagerBindingsManager.setBindings(
          appBindings.filter((b) => b.type !== ABI),
        );
        eagerBindingsManager.trySetBindings(
          appBindings.filter((b) => b.type === ABI),
        );
      };
    }

    const eagerCurrentDAO = cache.getBindingValue(
      "currentDAO",
      DATA_PROVIDER,
    ) as AragonDAO | undefined;

    const dao = await tryAndCacheNotFound(
      () => {
        const ensResolver = cache.getBindingValue(`aragonos:ensResolver`, USER);
        if (ensResolver !== null && ensResolver && !isAddress(ensResolver)) {
          throw new Error("");
        }
        return createDAO(
          daoNameOrAddress,
          eagerCurrentDAO,
          client,
          ipfsResolver,
          ensResolver as Nullable<Address> | undefined,
        );
      },
      daoNameOrAddress,
      DATA_PROVIDER,
      cache,
    );

    if (!dao) {
      return;
    }

    const appBindings = buildDAOBindings(
      dao,
      !closestCommandToCaret,
      true,
    );
    const abiBindings = appBindings.filter<AbiBinding>(
      (binding): binding is AbiBinding => binding.type === ABI,
    );

    // Cache DAO and ABIs
    cache.setBinding(daoNameOrAddress, dao.clone(), DATA_PROVIDER);
    cache.trySetBindings(abiBindings);

    return (eagerBindingsManager) => {
      const upperDAOBinding = eagerBindingsManager.getBinding(
        "currentDAO",
        BindingsSpace.DATA_PROVIDER,
      );

      eagerBindingsManager.enterScope(c.module);

      // DATA_PROVIDER bindings for completions DAO tracking
      const dpBindings: Binding[] = [
        {
          type: DATA_PROVIDER,
          identifier: dao.name ?? dao.kernel.address,
          value: dao,
        },
        {
          type: DATA_PROVIDER,
          identifier: "currentDAO",
          value: dao,
          parent: upperDAOBinding ?? undefined,
        },
      ];
      eagerBindingsManager.setBindings(dpBindings);

      const nonAbiBindings = appBindings.filter((b) => b.type !== ABI);
      eagerBindingsManager.setBindings(nonAbiBindings);
      eagerBindingsManager.trySetBindings(abiBindings);
    };
  },
  buildCompletionItemsForArg() {
    return [];
  },
});
