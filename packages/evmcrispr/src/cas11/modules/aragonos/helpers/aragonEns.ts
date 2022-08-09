import { resolveName } from '../../../../utils';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { HelperFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import type { AragonOS } from '../AragonOS';

function getAragonEnsResolver(chainId: number): string {
  switch (chainId) {
    case 4:
      return '0x98Df287B6C145399Aaa709692c8D308357bC085D';
    case 100:
      return '0xaafca6b0c89521752e559650206d7c925fd0e530';
    default:
      return '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  }
}

export const _aragonEns = async (
  ensName: string,
  module: AragonOS,
): Promise<string | null> => {
  const ensResolver = module.getModuleBinding('ensResolver', true);

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
    Interpreter.panic(h, `ENS ${ensName} couldn't be resolved.`);
  }

  return name;
};
