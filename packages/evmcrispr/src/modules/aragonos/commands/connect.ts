import type { providers } from 'ethers';
import { utils } from 'ethers';

import { ErrorException, ErrorNotFound } from '../../../errors';
import type {
  AbiBinding,
  Action,
  Address,
  AddressBinding,
  Binding,
  DataProviderBinding,
  ICommand,
  TransactionAction,
} from '../../../types';
import { BindingsSpace, NodeType, isProviderAction } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  NO_ENTITY,
  createDaoPrefixedIdentifier,
  getDAOAppIdentifiers,
} from '../utils';
import {
  ComparisonType,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  checkOpts,
  getOptValue,
  interpretNodeSync,
  isAddressNodishType,
} from '../../../utils';
import { batchForwarderActions } from '../utils/forwarders';
import { _aragonEns } from '../helpers/aragonEns';
import type { App, AppIdentifier } from '../types';
import type { BindingsManager } from '../../../BindingsManager';
import type { IPFSResolver } from '../../../IPFSResolver';

const { ABI, ADDR, DATA_PROVIDER, USER } = BindingsSpace;

const buildAppBindings = (
  appIdentifier: AppIdentifier,
  app: App,
  dao: AragonDAO,
  addPrefixedBindings: boolean,
): (AbiBinding | AddressBinding)[] => {
  const bindingIdentifiers = [];
  const finalAppIdentifier = appIdentifier.endsWith(':1')
    ? appIdentifier.slice(0, -2)
    : appIdentifier;

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
  upperDAOBinding?: DataProviderBinding,
  addPrefixedBindings = true,
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
      parent: upperDAOBinding,
    },
  ];

  dao.appCache.forEach((app, appIdentifier) => {
    const appBindings = buildAppBindings(
      appIdentifier,
      app,
      dao,
      addPrefixedBindings,
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
  ensResolver?: string,
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

    const daoBindings = buildDAOBindings(
      dao,
      bindingsManager.getBinding('currentDAO', BindingsSpace.DATA_PROVIDER),
    );

    bindingsManager.setBindings(daoBindings);
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
      module.signer.provider!,
      module.ipfsResolver,
      module.getConfigBinding('ensResolver'),
    );

    module.connectedDAOs.push(dao);

    const actions = (await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      blockInitializer: setDAOContext(module, dao),
    })) as Action[];

    if (actions.find((a) => isProviderAction(a))) {
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
      module.signer,
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
      const clonedDAO = (cachedDAOBinding.value as AragonDAO).clone();
      return (eagerBindingsManager) => {
        const upperDAOBinding = eagerBindingsManager.getBinding(
          'currentDAO',
          DATA_PROVIDER,
        );

        eagerBindingsManager.enterScope(c.module);
        eagerBindingsManager.setBindings(
          buildDAOBindings(clonedDAO, upperDAOBinding, !closestCommandToCaret),
        );
      };
    }

    try {
      const dao = await createDAO(
        daoNameOrAddress,
        cache,
        provider,
        ipfsResolver,
        cache.getBindingValue(`aragonos:ensResolver`, USER),
      );

      const daoBindings = buildDAOBindings(
        dao,
        undefined,
        !closestCommandToCaret,
      );
      const abiInterfaceBindings = daoBindings.filter<AbiBinding>(
        (binding): binding is AbiBinding => binding.type === ABI,
      );

      // Cache DAO and ABIs
      cache.setBinding(daoNameOrAddress, dao.clone(), DATA_PROVIDER);
      cache.mergeBindings(abiInterfaceBindings);

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

        eagerBindingsManager.setBindings(daoBindings);
      };
    } catch (err) {
      console.warn(err);
      // TODO: handle non-existent dao case
      return;
    }
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    if (argIndex > 0) {
      return getDAOAppIdentifiers(bindingsManager);
    }

    return [];
  },
};
