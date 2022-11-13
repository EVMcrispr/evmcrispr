import { BigNumber, utils } from 'ethers';

import { ErrorException } from '../../../errors';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';

import type { Tenderly } from '../Tenderly';

export const wait: ICommand<Tenderly> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });

    const [duration, period = BigNumber.from(1)] = await interpretNodes(c.args);

    if (!BigNumber.isBigNumber(duration)) {
      throw new ErrorException('duration must be a number');
    }

    if (!BigNumber.isBigNumber(period)) {
      throw new ErrorException('period must be a number');
    }

    return [
      {
        method: 'evm_increaseBlocks',
        params: [utils.hexValue(duration.div(period).sub(1))],
      },
      {
        method: 'evm_increaseTime',
        params: [utils.hexValue(duration)],
      },
    ];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
