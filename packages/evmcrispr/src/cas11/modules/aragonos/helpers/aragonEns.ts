import { ErrorInvalid } from '../../../../errors';
import { resolveName } from '../../../../utils';
import type { RawHelperFunction } from '../../../types';
import {
  CallableExpression,
  ComparisonType,
  checkArgsLength,
} from '../../../utils';
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

export const aragonEns: RawHelperFunction<AragonOS> = async (
  { signer },
  ...args: any[]
) => {
  checkArgsLength('aragonEns', CallableExpression.Helper, args.length, {
    type: ComparisonType.Between,
    minValue: 1,
    maxValue: 2,
  });

  const [ensName, ensResolver] = args;

  const name = await resolveName(
    ensName,
    ensResolver || getAragonEnsResolver(await signer.getChainId()),
    signer,
  );

  if (!name) {
    throw new ErrorInvalid(`ENS ${ensName} can not be resolved.`);
  }

  return name;
};
