import {
  ComparisonType,
  ErrorException,
  checkArgsLength,
  isNumberish,
} from '@1hive/evmcrispr';
import type { ICommand } from '@1hive/evmcrispr';
import { BigNumber, utils } from 'ethers';

import type { Tenderly } from '../Tenderly';

export const wait: ICommand<Tenderly> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });

    const [duration, period = BigNumber.from(1)] = await interpretNodes(c.args);

    if (!isNumberish(duration)) {
      throw new ErrorException('duration must be a number');
    }

    if (!isNumberish(period)) {
      throw new ErrorException('period must be a number');
    }

    return [
      {
        method: 'evm_increaseBlocks',
        params: [utils.hexValue(BigNumber.from(duration).div(period).sub(1))],
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
