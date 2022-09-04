import { constants, utils } from 'ethers';
import { isAddress } from 'ethers/lib/utils';

import {
  ComparisonType,
  addressesEqual,
  checkArgsLength,
} from '../../../utils';
import { EVMcrispr } from '../../../EVMcrispr';
import type { CommandFunction } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import { SEMANTIC_VERSION_REGEX, getRepoContract } from '../utils';
import { daoPrefixedIdentifierParser, getDAO } from '../utils/commands';

export const upgrade: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Between,
    minValue: 1,
    maxValue: 2,
  });

  const dao = getDAO(module, c, 0);

  const kernel = dao.getAppContract('kernel')!;

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
    EVMcrispr.panic(c, `${apmRepo} not installed on current DAO.`);
  }

  const repoAddr = await _aragonEns(apmRepo, module);

  if (!repoAddr) {
    EVMcrispr.panic(c, `ENS repo name ${apmRepo} couldn't be resolved`);
  }

  const repo = getRepoContract(repoAddr, module.signer);

  if (!newAppAddress) {
    [, newAppAddress] = await repo.getLatest();
  } else if (SEMANTIC_VERSION_REGEX.test(newAppAddress)) {
    [, newAppAddress] = await repo.getBySemanticVersion(
      newAppAddress.split('.'),
    );
  } else if (!isAddress(newAppAddress)) {
    EVMcrispr.panic(
      c,
      'second upgrade parameter must be a semantic version, an address, or nothing',
    );
  }

  if (addressesEqual(currentAppAddress, newAppAddress)) {
    EVMcrispr.panic(c, `trying to upgrade app to its current version`);
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
};
