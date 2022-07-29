import { utils } from 'ethers';

import type { Address } from '../../../..';
import {
  ANY_ENTITY,
  BURN_ENTITY,
  NO_ENTITY,
  resolveIdentifier,
} from '../../../../utils';
import { ErrorException, ErrorInvalid } from '../../../../errors';
import type { BindingsManager } from '../../../interpreter/BindingsManager';
import type { CommandFunction } from '../../../types';
import { NodeType } from '../../../types';
import { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { aragonEns } from '../helpers/aragonEns';

const prefixError = 'Connect command error';

const { BlockExpression } = NodeType;

const setDAOContext = (bindingsManager: BindingsManager, dao: AragonDAO) => {
  return () => {
    bindingsManager.setBinding('ANY_ENTITY', ANY_ENTITY);
    bindingsManager.setBinding('NO_ENTITY', NO_ENTITY);
    bindingsManager.setBinding('BURN_ENTITY', BURN_ENTITY);

    dao.appCache.forEach((app, appIdentifier) => {
      bindingsManager.setBinding(appIdentifier, app.address);
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
    const ensResolver = aragonos.getModuleVariable('ensResolver') as string;
    daoAddress = await aragonEns(
      `${daoAddressOrName}.aragonid.eth`,
      ensResolver,
      signer,
    );
  }

  const dao = await AragonDAO.create(
    daoAddress,
    aragonos.getModuleVariable('subgraphUrl'),
    signer,
    aragonos.ipfsResolver,
  );

  aragonos.setModuleVariable(daoAddressOrName, dao, true);

  return blockExpressionLazyNode.resolve(
    aragonos.alias ?? aragonos.name,
    setDAOContext(aragonos.bindingsManager, dao),
    resolveIdentifier,
  );
};
