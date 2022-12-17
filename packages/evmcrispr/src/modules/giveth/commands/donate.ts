import { BigNumber } from 'ethers';
import { isAddress } from 'ethers/lib/utils';

import { ErrorException } from '../../../errors';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';
import { _token, _tokenToDecimals } from '../../std/helpers/token';

import type { Giveth } from '../Giveth';
import { _projectAddr } from '../helpers/projectAddr';

const givethDonationRelayer = new Map([
  [4, '0xb477A12254991fa5AADcE237402e8338B74Bed30'],
  [100, '0xE4941fc4090a386B0a71762F58FdF638C85A21c1'],
]);

export const donate: ICommand<Giveth> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 3 });

    const [slug, amount, tokenSymbol] = await interpretNodes(c.args);

    const [projAddr, projectId] = await _projectAddr(module, slug);

    const rawAmount = await _tokenToDecimals(module, tokenSymbol, amount);

    const tokenAddr = await _token(module, tokenSymbol);

    if (!BigNumber.isBigNumber(amount)) {
      throw new ErrorException('amount is not a number');
    }

    if (!isAddress(tokenAddr)) {
      throw new ErrorException('token is not an address');
    }

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
