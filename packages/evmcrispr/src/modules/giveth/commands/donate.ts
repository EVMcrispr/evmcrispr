import { BigNumber } from 'ethers';

import { ErrorException } from '../../../errors';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';
import { _token, _tokenAmount } from '../../std/helpers/token';

import type { Giveth } from '../Giveth';
import { _projectAddr } from '../helpers/projectAddr';

export const givethDonationRelayer = new Map([
  [1, '0x01A5529F4b03059470785D7Bfbf25B180bE6f796'],
  [100, '0x01A5529F4b03059470785D7Bfbf25B180bE6f796'],
]);

export const donate: ICommand<Giveth> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 3 });

    const [slug, amount, tokenSymbol] = await interpretNodes(c.args);

    if (!BigNumber.isBigNumber(amount)) {
      throw new ErrorException('amount is not a number');
    }

    const [projAddr, projectId] = await _projectAddr(module, slug);

    const rawAmount = await _tokenAmount(module, tokenSymbol, amount);

    const tokenAddr = await _token(module, tokenSymbol);

    const chainId = await module.getChainId();

    if (!givethDonationRelayer.has(chainId)) {
      throw new ErrorException('network not supported by giveth');
    }

    return [
      encodeAction(tokenAddr, 'approve(address,uint256)', [
        givethDonationRelayer.get(chainId)!,
        rawAmount,
      ]),
      encodeAction(
        givethDonationRelayer.get(chainId)!,
        'sendDonation(address,address,uint256,uint256)',
        [tokenAddr, projAddr, rawAmount, projectId],
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
