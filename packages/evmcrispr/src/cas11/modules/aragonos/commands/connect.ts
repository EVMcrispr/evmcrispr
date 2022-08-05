import { utils } from 'ethers';

import type { Action, Address } from '../../../..';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  NO_ENTITY,
  addressesEqual,
} from '../../../../utils';
import { ErrorInvalid } from '../../../../errors';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { BindingsSpace } from '../../../interpreter/BindingsManager';
import { formatIdentifier } from '../utils';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
  resolveLazyNodes,
} from '../../../utils';
import { batchForwarderActions } from '../../../../modules/aragonos/utils/forwarders';

const prefixError = 'Connect command error';

const { BlockExpression } = NodeType;
const { ADDR } = BindingsSpace;

const setDAOContext = (
  aragonos: AragonOS,
  { dao, index, name }: { dao: AragonDAO; index: number; name?: string },
) => {
  return () => {
    const bindingsManager = aragonos.bindingsManager;

    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY, ADDR);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY, ADDR);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY, ADDR);

    aragonos.setCurrentDAO(dao);

    dao.appCache.forEach((app, appIdentifier) => {
      bindingsManager.setBinding(appIdentifier, app.address, ADDR);
      bindingsManager.setBinding(
        `_${index}:${appIdentifier}`,
        app.address,
        ADDR,
      );
      if (name) {
        bindingsManager.setBinding(`_${name}`, app.address, ADDR);
      }
    });
  };
};

export const connect: CommandFunction<AragonOS> = async (
  aragonos,
  lazyNodes,
) => {
  checkArgsLength('connect', CallableExpression.Command, lazyNodes.length, {
    type: ComparisonType.Greater,
    minValue: 2,
  });

  const [daoNameLazyNode, ...rest] = lazyNodes;
  const blockExpressionLazyNode = rest.pop();
  const forwarderApps = await resolveLazyNodes(rest);

  if (
    !blockExpressionLazyNode ||
    blockExpressionLazyNode.type !== BlockExpression
  ) {
    throw new ErrorInvalid(
      `${prefixError}: last argument should be a group of commands`,
    );
  }

  const daoAddressOrName = await daoNameLazyNode.resolve();
  let daoAddress: Address;

  if (utils.isAddress(daoAddressOrName)) {
    daoAddress = daoAddressOrName;
  } else {
    const ensResolver = aragonos.getModuleBinding('ensResolver', true);
    daoAddress = await aragonos.helpers.aragonEns(
      `${daoAddressOrName}.aragonid.eth`,
      ensResolver,
    );
  }

  const currentDao = aragonos.getCurrentDAO();

  if (currentDao && addressesEqual(currentDao.kernel.address, daoAddress)) {
    throw new ErrorInvalid(
      `${prefixError}: trying to connect to an already connected DAO (${daoAddress})`,
    );
  }

  // Allow us to keep track of connected DAOs inside nested 'connect' commands
  const nextNestingIndex = currentDao ? currentDao.nestingIndex + 1 : 0;

  const dao = await AragonDAO.create(
    daoAddress,
    aragonos.getModuleBinding('subgraphUrl', true),
    aragonos.signer,
    aragonos.ipfsResolver,
    nextNestingIndex,
  );

  aragonos.connectedDAOs.push(dao);

  const daoName = !utils.isAddress(daoAddressOrName)
    ? daoAddressOrName
    : undefined;

  const actions = (await blockExpressionLazyNode.resolve(
    aragonos.contextualName,
    setDAOContext(aragonos, { dao, index: nextNestingIndex, name: daoName }),
    formatIdentifier,
  )) as Action[];

  const invalidApps: any[] = [];
  const forwarderAppAddresses: Address[] = [];

  forwarderApps.forEach((app) => {
    const appAddress = dao.resolveApp(app)?.address;

    !utils.isAddress(appAddress)
      ? invalidApps.push(app)
      : forwarderAppAddresses.push(appAddress);
  });

  if (invalidApps.length) {
    throw new ErrorInvalid(
      `${prefixError}: invalid forwarder addresses found for the following: ${invalidApps.join(
        ', ',
      )}`,
    );
  }

  return batchForwarderActions(
    aragonos.signer,
    actions,
    forwarderAppAddresses.reverse(),
  );
};
