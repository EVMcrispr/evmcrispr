import { utils } from 'ethers';

import type { Address } from '../../../..';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  NO_ENTITY,
  addressesEqual,
  resolveIdentifier,
} from '../../../../utils';
import { ErrorException, ErrorInvalid } from '../../../../errors';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { BindingsSpace } from '../../../interpreter/BindingsManager';

const prefixError = 'Connect command error';

const { BlockExpression } = NodeType;
const { ADDR } = BindingsSpace;

const setDAOContext = (
  aragonos: AragonOS,
  dao: AragonDAO,
  daoIndex: string | number,
  daoName?: string,
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
        `_${daoIndex}:${appIdentifier}`,
        app.address,
        ADDR,
      );
      if (daoName) {
        bindingsManager.setBinding(`_${daoName}`, app.address, ADDR);
      }
    });
  };
};

export const connect: CommandFunction<AragonOS> = async (
  aragonos,
  lazyNodes,
  signer,
) => {
  if (!signer) {
    throw new ErrorException('Signer missing');
  }

  if (lazyNodes.length < 2) {
    throw new ErrorInvalid(
      `${prefixError}: invalid number of arguments. Expected at least 2 and got ${lazyNodes.length}`,
    );
  }

  const [daoNameLazyNode, blockExpressionLazyNode] = lazyNodes;

  if (blockExpressionLazyNode.type !== BlockExpression) {
    throw new ErrorInvalid(
      `${prefixError}: second argument should be a group of commands`,
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
      signer,
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
    signer,
    aragonos.ipfsResolver,
    nextNestingIndex,
  );

  aragonos.connectedDAOs.push(dao);

  const daoName = !utils.isAddress(daoAddressOrName)
    ? daoAddressOrName
    : undefined;

  return blockExpressionLazyNode.resolve(
    aragonos.alias ?? aragonos.name,
    setDAOContext(aragonos, dao, nextNestingIndex, daoName),
    resolveIdentifier,
  );
};
