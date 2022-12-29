import { Contract, utils } from 'ethers';

import { ErrorException } from '../../errors';
import type { HelperFunction } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

export const get: HelperFunction<Std> = async (
  module,
  h,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(h, { type: ComparisonType.Greater, minValue: 2 });

  const [addressNode, abiNode, ...rest] = h.args;
  const [address, abi, params] = await Promise.all([
    interpretNode(addressNode),
    interpretNode(abiNode, { treatAsLiteral: true }),
    interpretNodes(rest),
  ]);

  if (!utils.isAddress(address)) {
    throw new ErrorException(
      `expected a valid target address, but got "${address}"`,
    );
  }

  const [body, returns, index] = abi.split(':');
  const contract = new Contract(
    address,
    [`function ${body} external view returns ${returns}`],
    await module.getProvider(),
  );

  const result = await contract[body](...params);
  return index ? result[index] : result;
};
