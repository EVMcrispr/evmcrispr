import { ethers, utils } from 'ethers';

import { ErrorException } from '../../../errors';
import type {
  AbiBinding,
  Action,
  Address,
  AddressBinding,
  Binding,
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
  getAddressFromNode,
  getOptValue,
  isAddressNodishType,
} from '../../../utils';
import { batchForwarderActions } from '../utils/forwarders';
import { _aragonEns } from '../helpers/aragonEns';
import type { App, AppIdentifier } from '../types';

const { ABI, ADDR, DATA_PROVIDER, USER } = BindingsSpace;

const buildAppBindings = (
  appIdentifier: AppIdentifier,
  app: App,
  dao: AragonDAO,
  prefixBindings: boolean,
): (AbiBinding | AddressBinding)[] => {
  const bindingIdentifiers = [];

  if (appIdentifier.endsWith(':1')) {
    const nameWithoutIndex = appIdentifier.slice(0, -2);
    bindingIdentifiers.push(
      prefixBindings
        ? createDaoPrefixedIdentifier(
            nameWithoutIndex,
            dao.name ?? dao.kernel.address,
          )
        : nameWithoutIndex,
    );
  } else {
    bindingIdentifiers.push(
      prefixBindings
        ? createDaoPrefixedIdentifier(
            appIdentifier,
            dao.name ?? dao.kernel.address,
          )
        : appIdentifier,
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
  prefixBindings: boolean,
): Binding[] => {
  const daoBindings: Binding[] = [
    {
      type: DATA_PROVIDER,
      identifier: dao.name ?? dao.kernel.address,
      value: dao,
    },
  ];

  dao.appCache.forEach((app, appIdentifier) => {
    const appBindings = buildAppBindings(
      appIdentifier,
      app,
      dao,
      prefixBindings,
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

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    const bindingsManager = aragonos.bindingsManager;

    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY, ADDR);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY, ADDR);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY, ADDR);

    aragonos.currentDAO = dao;

    const daoBindings = buildDAOBindings(dao, true);

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
    let daoAddress: Address;

    if (utils.isAddress(daoAddressOrName)) {
      daoAddress = daoAddressOrName;
    } else {
      const daoENSName = `${daoAddressOrName}.aragonid.eth`;
      const res = await _aragonEns(
        daoENSName,
        module.signer.provider!,
        module.getConfigBinding('ensResolver'),
      );

      if (!res) {
        throw new ErrorException(
          `ENS DAO name ${daoAddressOrName} couldn't be resolved`,
        );
      }

      daoAddress = res;
    }

    const currentDao = module.currentDAO;

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

    const dao = await AragonDAO.create(
      daoAddress,
      module.signer.provider ??
        ethers.getDefaultProvider(await module.signer.getChainId()),
      module.ipfsResolver,
      nextNestingIndex,
      daoName,
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
    { args },
    cache,
    provider,
    ipfsResolver,
    caretPos,
    closestCommandToCaret,
  ) {
    const daoNode = args[0];

    if (
      beforeOrEqualNode(daoNode, caretPos) ||
      !daoNode ||
      !isAddressNodishType(daoNode)
    ) {
      return;
    }

    const daoNameOrAddress =
      getAddressFromNode(daoNode, cache) ?? daoNode.value;

    const cachedDAO = cache.getBindingValue(daoNameOrAddress, DATA_PROVIDER) as
      | AragonDAO
      | undefined;

    if (cachedDAO) {
      return buildDAOBindings(cachedDAO, closestCommandToCaret);
    }

    let daoAddress: string;
    if (utils.isAddress(daoNameOrAddress)) {
      daoAddress = daoNameOrAddress;
    } else {
      const daoENSName = `${daoNameOrAddress}.aragonid.eth`;
      const res = await _aragonEns(
        daoENSName,
        provider,
        cache.getBindingValue(`aragonos:ensResolver`, USER),
      );

      if (!res) {
        return;
      }
      daoAddress = res;
    }

    try {
      const dao = await AragonDAO.create(
        daoAddress,
        provider,
        ipfsResolver,
        0,
        daoNameOrAddress,
      );

      return buildDAOBindings(dao, closestCommandToCaret);
    } catch (err) {
      // TODO: handle non-existent dao case
      return;
    }
  },
  buildCompletionItemsForArg(argIndex, _, cache) {
    if (argIndex > 0) {
      return getDAOAppIdentifiers(cache);
    }

    return [];
  },
};
