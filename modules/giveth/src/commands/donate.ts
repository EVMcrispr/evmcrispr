import {
  ComparisonType,
  ErrorException,
  checkArgsLength,
  encodeAction,
  isNumberish,
} from '@1hive/evmcrispr';
import type { ICommand } from '@1hive/evmcrispr';
import { isAddress } from 'ethers/lib/utils';

import type { Giveth } from '../Giveth';
import { _projectAddr } from '../helpers/projectAddr';
import { GIVETH_DONATION_RELAYER } from '../utils';

export const donate: ICommand<Giveth> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 3 });

    const [slug, amount, tokenAddr] = await interpretNodes(c.args);

    if (!isNumberish(amount)) {
      throw new ErrorException('amount is not a number');
    }

    if (!isAddress(tokenAddr)) {
      throw new ErrorException('token is not an address');
    }

    const [projAddr, projectId] = await _projectAddr(module, slug);

    const chainId = await module.getChainId();

    if (!GIVETH_DONATION_RELAYER.has(chainId)) {
      throw new ErrorException('network not supported by giveth');
    }

    return [
      encodeAction(tokenAddr, 'approve(address,uint256)', [
        GIVETH_DONATION_RELAYER.get(chainId)!,
        amount,
      ]),
      encodeAction(
        GIVETH_DONATION_RELAYER.get(chainId)!,
        'sendDonation(address,address,uint256,uint256)',
        [tokenAddr, projAddr, amount, projectId],
      ),
    ];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
