import { encode } from '@ensdomains/content-hash';

import type { Ens } from '../Ens';
import type { HelperFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';

export const contenthash: HelperFunction<Ens> = async (
  _,
  h,
  { interpretNode },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });
  const [codec, hash] = (await interpretNode(h.args[0])).split(':');
  if (!['ipfs', 'ipns', 'skynet'].includes(codec)) {
    throw new Error(
      'Only ipfs, ipns and skynet are supported. The hash format should be <codec>:<hash>',
    );
  }
  if (!hash) {
    throw new Error('The hash format should be <codec>:<hash>');
  }
  return '0x' + encode(codec + '-ns', hash);
};
