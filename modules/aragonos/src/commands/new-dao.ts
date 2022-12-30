import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  buildNonceForAddress,
  calculateNewProxyAddress,
  checkArgsLength,
} from '@1hive/evmcrispr';
import type { Action, ICommand } from '@1hive/evmcrispr';
import { Contract, utils } from 'ethers';

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
    await module.getProvider(),
  );

  const chainId = await module.getChainId();

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

export const newDAO: ICommand<AragonOS> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

    const provider = await module.getProvider();

    const daoName = await interpretNode(c.args[0], { treatAsLiteral: true });

    const bareTemplate = new utils.Interface([
      'function newInstance() public returns (address)',
    ]);

    const bareTemplateRepoAddr = (await _aragonEns(
      `bare-template.aragonpm.eth`,
      provider,
      module.getConfigBinding('ensResolver'),
    ))!;

    const bareTemplateRepo = new Contract(
      bareTemplateRepoAddr,
      [
        'function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
      ],
      provider,
    );

    const bareTemplateAddr = (await bareTemplateRepo.getLatest())
      .contractAddress;

    const daoFactory = DAO_FACTORIES.get(await module.getChainId());
    if (!daoFactory) {
      throw new ErrorException('network not supported');
    }
    const nonce = await buildNonceForAddress(
      daoFactory,
      await module.incrementNonce(daoFactory),
      provider,
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
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
};
