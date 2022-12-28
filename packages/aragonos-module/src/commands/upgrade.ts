import type { ICommand } from '@1hive/evmcrispr';
import {
  ComparisonType,
  ErrorException,
  addressesEqual,
  checkArgsLength,
} from '@1hive/evmcrispr';
import { constants, utils } from 'ethers';
import { isAddress } from 'ethers/lib/utils';

import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import {
  SEMANTIC_VERSION_REGEX,
  getDAOAppIdentifiers,
  getRepoContract,
} from '../utils';
import { daoPrefixedIdentifierParser, getDAO } from '../utils/commands';

export const upgrade: ICommand<AragonOS> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 1,
      maxValue: 2,
    });

    const dao = getDAO(module.bindingsManager, c.args[0]);

    const kernel = dao.getAppContract('kernel', await module.getProvider())!;

    const args = await Promise.all([
      interpretNode(c.args[0], { treatAsLiteral: true }),
      c.args[1] ? interpretNode(c.args[1]) : undefined,
    ]);
    const rawApmRepo = args[0];
    let newAppAddress = args[1];

    // Check for dao-prefixed identifiers
    const parserRes = daoPrefixedIdentifierParser.run(rawApmRepo);
    let apmRepo = !parserRes.isError ? parserRes.result[1] : rawApmRepo;

    if (
      !apmRepo.endsWith('aragonpm.eth') &&
      !apmRepo.endsWith('open.aragonpm.eth')
    ) {
      apmRepo = `${apmRepo}.aragonpm.eth`;
    }

    const KERNEL_APP_BASE_NAMESPACE = utils.id('base');
    const appId = utils.namehash(apmRepo);

    const currentAppAddress = await kernel.getApp(
      KERNEL_APP_BASE_NAMESPACE,
      appId,
    );

    if (currentAppAddress === constants.AddressZero) {
      throw new ErrorException(`${apmRepo} not installed on current DAO.`);
    }

    const repoAddr = await _aragonEns(
      apmRepo,
      await module.getProvider(),
      module.getConfigBinding('ensResolver'),
    );

    if (!repoAddr) {
      throw new ErrorException(`ENS repo name ${apmRepo} couldn't be resolved`);
    }

    const repo = getRepoContract(repoAddr, await module.getProvider());

    if (!newAppAddress) {
      [, newAppAddress] = await repo.getLatest();
    } else if (SEMANTIC_VERSION_REGEX.test(newAppAddress)) {
      [, newAppAddress] = await repo.getBySemanticVersion(
        newAppAddress.split('.'),
      );
    } else if (!isAddress(newAppAddress)) {
      throw new ErrorException(
        'second upgrade parameter must be a semantic version, an address, or nothing',
      );
    }

    if (addressesEqual(currentAppAddress, newAppAddress)) {
      throw new ErrorException(`trying to upgrade app to its current version`);
    }

    return [
      {
        to: kernel.address,
        data: kernel.interface.encodeFunctionData(
          'setApp(bytes32,bytes32,address)',
          [KERNEL_APP_BASE_NAMESPACE, appId, newAppAddress],
        ),
      },
    ];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      case 0:
        return getDAOAppIdentifiers(bindingsManager);
      default:
        return [];
    }
  },
  async runEagerExecution() {
    return;
  },
};
