import { Contract, utils } from 'ethers';

import { ErrorException } from '../../../errors';
import {
  ComparisonType,
  buildNonceForAddress,
  calculateNewProxyAddress,
  checkArgsLength,
} from '../../../utils';
import { BindingsSpace } from '../../../BindingsManager';
import type { Action, CommandFunction } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import {
  ARAGON_REGISTRARS,
  DAO_FACTORIES,
  getAragonRegistrarContract,
} from '../utils';

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
    throw new ErrorException(
      `no Aragon registrar was found on chain ${chainId}`,
    );
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

  const bareTemplateRepoAddr = (await _aragonEns(
    `bare-template.aragonpm.eth`,
    module,
  ))!;

  const bareTemplateRepo = new Contract(
    bareTemplateRepoAddr,
    [
      'function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
    ],
    module.signer,
  );

  const bareTemplateAddr = (await bareTemplateRepo.getLatest()).contractAddress;

  const daoFactory = DAO_FACTORIES.get(await module.signer.getChainId());
  if (!daoFactory) {
    throw new ErrorException('network not supported');
  }
  const nonce = await buildNonceForAddress(
    daoFactory,
    module.incrementNonce(daoFactory),
    module.signer.provider!,
  );
  const newDaoAddress = calculateNewProxyAddress(daoFactory, nonce);

  module.bindingsManager.setBinding(
    `_${daoName}`,
    newDaoAddress,
    BindingsSpace.ADDR,
  );

  let registerAragonIdActions: Action[] = [];

  registerAragonIdActions = await registerAragonId(
    module,
    daoName,
    newDaoAddress,
  );

  return [
    {
      to: bareTemplateAddr!,
      data: bareTemplate.encodeFunctionData('newInstance', []),
    },
    ...registerAragonIdActions,
  ];
};
