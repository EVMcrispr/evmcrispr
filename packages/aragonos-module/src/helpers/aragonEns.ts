import type { HelperFunction, Nullable } from '@1hive/evmcrispr';
import {
  ComparisonType,
  ErrorException,
  checkArgsLength,
} from '@1hive/evmcrispr';
import type { ethers } from 'ethers';

import type { AragonOS } from '../AragonOS';

import { getAragonEnsResolver, resolveName } from '../utils';

export const _aragonEns = async (
  ensName: string,
  provider: ethers.providers.Provider,
  customENSResolver?: Nullable<string>,
): Promise<string | null> => {
  const name = await resolveName(
    ensName,
    customENSResolver ||
      getAragonEnsResolver((await provider.getNetwork()).chainId),
    provider,
  );

  return name;
};

export const aragonEns: HelperFunction<AragonOS> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Between,
    minValue: 1,
    maxValue: 2,
  });

  const [ensName] = await interpretNodes(h.args);

  const customENSResolver = module.getConfigBinding('ensResolver');
  const name = await _aragonEns(
    ensName,
    await module.getProvider(),
    customENSResolver,
  );

  if (!name) {
    throw new ErrorException(`ENS ${ensName} couldn't be resolved.`);
  }

  return name;
};
