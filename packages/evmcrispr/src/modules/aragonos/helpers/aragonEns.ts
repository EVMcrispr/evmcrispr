import { ComparisonType, checkArgsLength } from '../../../utils';
import type { AragonOS } from '../AragonOS';
import type { HelperFunction } from '../../../types';
import { EVMcrispr } from '../../../EVMcrispr';
import { getAragonEnsResolver, resolveName } from '../utils';

export const _aragonEns = async (
  ensName: string,
  module: AragonOS,
): Promise<string | null> => {
  const ensResolver = module.getModuleBinding('ensResolver');

  const name = await resolveName(
    ensName,
    ensResolver || getAragonEnsResolver(await module.signer.getChainId()),
    module.signer,
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

  const name = await _aragonEns(ensName, module);

  if (!name) {
    EVMcrispr.panic(h, `ENS ${ensName} couldn't be resolved.`);
  }

  return name;
};
