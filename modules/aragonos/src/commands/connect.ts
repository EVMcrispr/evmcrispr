import type {
  AbiBinding,
  Action,
  Address,
  AddressBinding,
  Binding,
  BindingsManager,
  DataProviderBinding,
  ICommand,
  IPFSResolver,
  Nullable,
  TransactionAction,
} from '@1hive/evmcrispr';
import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  ErrorNotFound,
  NodeType,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  checkOpts,
  getOptValue,
  interpretNodeSync,
  isAddressNodishType,
  isSwitchAction,
  tryAndCacheNotFound,
} from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { utils } from 'ethers';

import { AragonDAO, isAragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import type { App, AppIdentifier } from '../types';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  INITIAL_APP_INDEX,
  NO_ENTITY,
  batchForwarderActions,
  createDaoPrefixedIdentifier,
  formatAppIdentifier,
  getDAOAppIdentifiers,
} from '../utils';

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
    value: app.abiInterface,
  };

  return [...appAddressBindings, appAbiBinding];
};

const buildDAOBindings = (
  dao: AragonDAO,
  upperDAOBinding?: Nullable<DataProviderBinding>,
  addPrefixedBindings = true,
  omitRedudantIdentifier = false,
): Binding[] => {
  const daoBindings: Binding[] = [
    {
      type: DATA_PROVIDER,
      identifier: dao.name ?? dao.kernel.address,
      value: dao,
    },
    {
      type: DATA_PROVIDER,
      identifier: 'currentDAO',
      value: dao,
      parent: upperDAOBinding ?? undefined,
    },
  ];

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
        value: app.abiInterface,
      });
    }
    daoBindings.push(...appBindings);
  });

  return daoBindings;
};

const createDAO = async (
  daoAddressOrName: Address | string,
  bindingsManager: BindingsManager,
  provider: providers.Provider,
  ipfsResolver: IPFSResolver,
  ensResolver?: Nullable<string>,
): Promise<AragonDAO> => {
  let daoAddress: Address;

  if (utils.isAddress(daoAddressOrName)) {
    daoAddress = daoAddressOrName;
  } else {
    const daoENSName = `${daoAddressOrName}.aragonid.eth`;
    const res = await _aragonEns(daoENSName, provider!, ensResolver);

    if (!res) {
      throw new ErrorNotFound(
        `ENS DAO name ${daoAddressOrName} couldn't be resolved`,
      );
    }

    daoAddress = res;
  }

  const currentDao = bindingsManager.getBindingValue(
    'currentDAO',
    BindingsSpace.DATA_PROVIDER,
  ) as AragonDAO | undefined;

  if (currentDao && addressesEqual(currentDao.kernel.address, daoAddress)) {
    throw new ErrorException(
      `trying to connect to an already connected DAO (${daoAddress})`,
    );
  }

  // Allow us to keep track of connected DAOs inside nested 'connect' commands
  const nextNestingIndex = currentDao ? currentDao.nestingIndex + 1 : 1;

  const daoName = !utils.isAddress(daoAddressOrName)
    ? daoAddressOrName
    : undefined;

  return AragonDAO.create(
    daoAddress,
    provider,
    ipfsResolver,
    nextNestingIndex,
    daoName,
  );
};

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    const bindingsManager = aragonos.bindingsManager;

    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY, ADDR);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY, ADDR);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY, ADDR);

    aragonos.currentDAO = dao;

    const upperDAOBinding = bindingsManager.getBinding(
      'currentDAO',
      BindingsSpace.DATA_PROVIDER,
    );
    const daoBindings = buildDAOBindings(
      dao,
      upperDAOBinding === null ? undefined : upperDAOBinding,
    );

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

export const connect: ICommand<AragonOS> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 2,
    });
    checkOpts(c, ['context']);

    const [daoNameNode, ...rest] = c.args;
    const blockExpressionNode = rest.pop();

    const forwarderApps = await interpretNodes(rest);

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const daoAddressOrName = await interpretNode(daoNameNode);
    const dao = await createDAO(
      daoAddressOrName,
      module.bindingsManager,
      await module.getProvider(),
      module.ipfsResolver,
      module.getConfigBinding('ensResolver'),
    );

    module.connectedDAOs.push(dao);

    const actions = (await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      blockInitializer: setDAOContext(module, dao),
    })) as Action[];

    if (actions.find((a) => isSwitchAction(a))) {
      throw new ErrorException(
        `can't switch networks inside a connect command`,
      );
    }

    const invalidApps: any[] = [];
    const forwarderAppAddresses: Address[] = [];

    forwarderApps.forEach((appOrAddress: string) => {
      const appAddress = utils.isAddress(appOrAddress)
        ? appOrAddress
        : dao.resolveApp(appOrAddress)?.address;

      if (!appAddress) {
        throw new ErrorException(
          `${appOrAddress} is not a DAO's forwarder app`,
        );
      }

      !utils.isAddress(appAddress)
        ? invalidApps.push(appOrAddress)
        : forwarderAppAddresses.push(appAddress);
    });

    if (invalidApps.length) {
      throw new ErrorException(
        `invalid forwarder addresses found for the following: ${invalidApps.join(
          ', ',
        )}`,
      );
    }

    const context = await getOptValue(c, 'context', interpretNode);

    return batchForwarderActions(
      module,
      actions as TransactionAction[],
      forwarderAppAddresses.reverse(),
      context,
    );
  },
  async runEagerExecution(
    c,
    cache,
    { ipfsResolver, provider },
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
      daoAddress && utils.isAddress(daoAddress) ? daoAddress : daoNode.value;

    const cachedDAOBinding = cache.getBinding(daoNameOrAddress, DATA_PROVIDER);

    if (cachedDAOBinding) {
      const cachedDAO = cachedDAOBinding.value;
      if (!cachedDAO || !isAragonDAO(cachedDAO)) {
        return;
      }

      const clonedDAO = cachedDAO.clone();
      return (eagerBindingsManager) => {
        const upperDAOBinding = eagerBindingsManager.getBinding(
          'currentDAO',
          DATA_PROVIDER,
        );

        eagerBindingsManager.enterScope(c.module);
        eagerBindingsManager.setBindings(
          buildDAOBindings(
            clonedDAO,
            upperDAOBinding,
            !closestCommandToCaret,
            true,
          ),
        );
      };
    }

    const dao = await tryAndCacheNotFound(
      () =>
        createDAO(
          daoNameOrAddress,
          cache,
          provider,
          ipfsResolver,
          cache.getBindingValue(`aragonos:ensResolver`, USER),
        ),
      daoNameOrAddress,
      DATA_PROVIDER,
      cache,
    );

    if (!dao) {
      return;
    }

    const daoBindings = buildDAOBindings(
      dao,
      undefined,
      !closestCommandToCaret,
      true,
    );
    const abiBindings = daoBindings.filter<AbiBinding>(
      (binding): binding is AbiBinding => binding.type === ABI,
    );

    // Cache DAO and ABIs
    cache.setBinding(daoNameOrAddress, dao.clone(), DATA_PROVIDER);
    cache.trySetBindings(abiBindings);

    return (eagerBindingsManager) => {
      const upperDAOBinding = eagerBindingsManager.getBinding(
        'currentDAO',
        BindingsSpace.DATA_PROVIDER,
      );
      const currentDAOBinding = daoBindings.find(
        (b) => b.identifier === 'currentDAO',
      )!;

      currentDAOBinding.parent = upperDAOBinding;

      eagerBindingsManager.enterScope(c.module);

      const nonAbiBindings = daoBindings.filter((b) => b.type !== ABI);

      eagerBindingsManager.setBindings(nonAbiBindings);
      eagerBindingsManager.trySetBindings(abiBindings);
    };
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    if (argIndex > 0) {
      return getDAOAppIdentifiers(bindingsManager);
    }

    return [];
  },
};
