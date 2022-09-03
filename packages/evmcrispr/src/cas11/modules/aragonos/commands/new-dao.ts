import { utils } from 'ethers';

import type { Action } from '../../../..';
import { CommandError } from '../../../../errors';

import {
  buildNonceForAddress,
  calculateNewProxyAddress,
} from '../../../../utils';
import { BindingsSpace } from '../../../interpreter/BindingsManager';

import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import { ARAGON_REGISTRARS, getAragonRegistrarContract } from '../utils';

const registerAragonId = async (
  module: AragonOS,
  name: string,
  owner: string,
): Promise<Action[]> => {
  const aragonRegistrar = await getAragonRegistrarContract(
    module.signer.provider!,
  );

  const chainId = await module.signer.getChainId();

  if (!ARAGON_REGISTRARS.has(chainId)) {
    throw new Error(`no Aragon registrar was found on chain ${chainId}`);
  }

  return [
    {
      to: ARAGON_REGISTRARS.get(chainId)!,
      data: aragonRegistrar.interface.encodeFunctionData('register', [
        utils.solidityKeccak256(['string'], [name]),
        owner,
      ]),
    },
  ];
};

export const newDAO: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode },
) => {
  checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

  const daoName = await interpretNode(c.args[0], { treatAsLiteral: true });

  const bareTemplate = new utils.Interface([
    'function newInstance() public returns (address)',
  ]);

  const bareTemplateAddr = (await _aragonEns(
    `bare-template.aragonpm.eth`,
    module,
  ))!;

  const nonce = await buildNonceForAddress(
    bareTemplateAddr,
    module.incrementNonce(bareTemplateAddr),
    module.signer.provider!,
  );
  const newDaoAddress = calculateNewProxyAddress(bareTemplateAddr, nonce);

  module.bindingsManager.setBinding(
    `_${daoName}`,
    newDaoAddress,
    BindingsSpace.ADDR,
  );

  let registerAragonIdActions: Action[] = [];

  try {
    registerAragonIdActions = await registerAragonId(
      module,
      daoName,
      newDaoAddress,
    );
  } catch (err) {
    const err_ = err as Error;

    throw new CommandError(c, err_.message);
  }

  return [
    {
      to: bareTemplateAddr!,
      data: bareTemplate.encodeFunctionData('newInstance', []),
    },
    ...registerAragonIdActions,
  ];
};
