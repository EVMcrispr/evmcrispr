import { ethers, utils } from 'ethers';

import { ErrorException } from '../../../errors';
import type {
  Action,
  Address,
  CommandFunction,
  TransactionAction,
} from '../../../types';
import { NodeType, isProviderAction } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { ANY_ENTITY, BURN_ENTITY, NO_ENTITY } from '../utils';
import { BindingsSpace } from '../../../BindingsManager';
import type { BindingsManager } from '../../../BindingsManager';
import {
  ComparisonType,
  addressesEqual,
  checkArgsLength,
  checkOpts,
  getOptValue,
} from '../../../utils';
import { batchForwarderActions } from '../utils/forwarders';
import { _aragonEns } from '../helpers/aragonEns';

const { BlockExpression } = NodeType;
const { ABI, ADDR } = BindingsSpace;

const setAppBindings = (
  bindingsManager: BindingsManager,
  appName: string,
  appAddress: Address,
  daoIndex: number,
  daoName?: string,
) => {
  bindingsManager.setBinding(appName, appAddress, ADDR);
  bindingsManager.setBinding(`_${daoIndex}:${appName}`, appAddress, ADDR);
  if (daoName) {
    bindingsManager.setBinding(`_${daoName}:${appName}`, appAddress, ADDR);
  }
};

const setDAOContext = (
  aragonos: AragonOS,
  {
    dao,
    index,
    name: daoName,
  }: { dao: AragonDAO; index: number; name?: string },
) => {
  return async () => {
    const bindingsManager = aragonos.bindingsManager;

    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY, ADDR);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY, ADDR);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY, ADDR);

    aragonos.currentDAO = dao;

    // We can reference DAOs by their name nesting index or kernel address
    aragonos.setModuleBinding(dao.kernel.address, dao);
    aragonos.setModuleBinding(index.toString(), dao);
    if (daoName) {
      aragonos.setModuleBinding(daoName, dao);
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
        setAppBindings(
          bindingsManager,
          nameWithoutIndex,
          app.address,
          index,
          daoName,
        );
      }

      setAppBindings(
        bindingsManager,
        appIdentifier,
        app.address,
        index,
        daoName,
      );
    });
  };
};

export const connect: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
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
    const res = await _aragonEns(daoENSName, module);

    if (!res) {
      throw new ErrorException(
        `ENS DAO name ${daoENSName} couldn't be resolved`,
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

  const dao = await AragonDAO.create(
    daoAddress,
    module.signer.provider ??
      ethers.getDefaultProvider(await module.signer.getChainId()),
    module.connector,
    module.ipfsResolver,
    nextNestingIndex,
  );

  module.connectedDAOs.push(dao);

  const daoName = !utils.isAddress(daoAddressOrName)
    ? daoAddressOrName
    : undefined;

  const actions = (await interpretNode(blockExpressionNode, {
    blockModule: module.contextualName,
    blockInitializer: setDAOContext(module, {
      dao,
      index: nextNestingIndex,
      name: daoName,
    }),
  })) as Action[];

  if (actions.find((a) => isProviderAction(a))) {
    throw new ErrorException(`can't switch networks inside a connect command`);
  }

  const invalidApps: any[] = [];
  const forwarderAppAddresses: Address[] = [];

  forwarderApps.forEach((appOrAddress: string) => {
    const appAddress = utils.isAddress(appOrAddress)
      ? appOrAddress
      : dao.resolveApp(appOrAddress)?.address;

    if (!appAddress) {
      throw new ErrorException(`${appOrAddress} is not a DAO's forwarder app`);
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
};
