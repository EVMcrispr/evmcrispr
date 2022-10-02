import { ethers, utils } from 'ethers';

import { ErrorException } from '../../../errors';
import type {
  Action,
  Address,
  DataProviderBinding,
  ICommand,
  IDataProvider,
  TransactionAction,
} from '../../../types';
import { BindingsSpace, NodeType, isProviderAction } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from '../utils';
import type { BindingsManager } from '../../../BindingsManager';
import {
  ComparisonType,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from '../../../utils';
import { batchForwarderActions } from '../utils/forwarders';
import { _aragonEns } from '../helpers/aragonEns';

const { AddressLiteral, BlockExpression, ProbableIdentifier } = NodeType;
const { ABI, ADDR, DATA_PROVIDER, USER } = BindingsSpace;

const setAppBindings = (
  bindingsManager: BindingsManager,
  appName: string,
  appAddress: Address,
  dao: AragonDAO,
) => {
  bindingsManager.setBinding(appName, appAddress, ADDR);
  bindingsManager.setBinding(
    `_${dao.nestingIndex}:${appName}`,
    appAddress,
    ADDR,
  );
  bindingsManager.setBinding(
    `_${dao.kernel.address}:${appName}`,
    appAddress,
    ADDR,
  );
  if (dao.name) {
    bindingsManager.setBinding(`_${dao.name}:${appName}`, appAddress, ADDR);
  }
};

const setDAOContext = (aragonos: AragonOS, dao: AragonDAO) => {
  return async () => {
    const { name, nestingIndex } = dao;
    const bindingsManager = aragonos.bindingsManager;

    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY, ADDR);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY, ADDR);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY, ADDR);

    aragonos.currentDAO = dao;

    // We can reference DAOs by their name, nesting index or kernel address
    bindingsManager.setBinding(dao.kernel.address, dao, DATA_PROVIDER);
    bindingsManager.setBinding(nestingIndex.toString(), dao, DATA_PROVIDER);
    if (name) {
      bindingsManager.setBinding(name, dao, DATA_PROVIDER);
    }

    dao.appCache.forEach((app, appIdentifier) => {
      bindingsManager.setBinding(app.address, app.abiInterface, ABI);

      // There could be the case of having multiple same-version apps on the DAO
      // so avoid setting the same binding twice
      if (!bindingsManager.hasBinding(app.codeAddress, ABI)) {
        bindingsManager.setBinding(app.codeAddress, app.abiInterface, ABI);
      }

      if (appIdentifier.endsWith(':0')) {
        const nameWithoutIndex = appIdentifier.slice(
          0,
          appIdentifier.length - 2,
        );
        setAppBindings(bindingsManager, nameWithoutIndex, app.address, dao);
      }

      setAppBindings(bindingsManager, appIdentifier, app.address, dao);
    });
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

    if (!blockExpressionNode || blockExpressionNode.type !== BlockExpression) {
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
    nodeArgs,
    cache,
    provider,
    ipfsResolver,
    caretPos,
  ): Promise<DataProviderBinding | undefined> {
    const daoNode = nodeArgs[0];

    if (
      beforeOrEqualNode(daoNode, caretPos) ||
      !daoNode ||
      ![AddressLiteral, ProbableIdentifier].includes(daoNode.type)
    ) {
      console.log('SKIP RUN EAGER EXECUTION');
      return;
    }

    const daoNameOrAddress = daoNode.value;

    const cachedDAO = cache.getBinding(daoNameOrAddress, DATA_PROVIDER);

    if (cachedDAO) {
      console.log('RETURNING CACHED DAO');
      return cachedDAO;
    }

    let daoAddress: string, daoName: string | undefined;
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
      daoName = daoNameOrAddress;
    }

    try {
      console.log('CREATING DAO');
      const dao = await AragonDAO.create(
        daoAddress,
        provider,
        ipfsResolver,
        0,
        daoName,
      );

      return {
        identifier: daoNameOrAddress,
        value: dao,
        type: BindingsSpace.DATA_PROVIDER,
      };
    } catch (err) {
      return;
    }
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, cache) {
    if (argIndex > 0) {
      const dataProviders = cache
        .getAllBindingsFromSpace(BindingsSpace.DATA_PROVIDER)
        .map<IDataProvider>((b) => b.value)
        .filter<AragonDAO>(
          (dataProvider): dataProvider is AragonDAO =>
            dataProvider.type === 'ARAGON_DAO',
        );

      return dataProviders.flatMap((provider) =>
        provider.getIdentifiers(false),
      );
    }

    return [];
  },
};
