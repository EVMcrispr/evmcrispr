import { utils } from 'ethers';

import { ErrorException } from '../../../errors';
import { BigDecimal, isBigDecimalish } from '../../../BigDecimal';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';

import type { Tenderly } from '../Tenderly';

export const wait: ICommand<Tenderly> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });

    const [duration, period = BigDecimal.from(1)] = await interpretNodes(
      c.args,
    );

    if (!isBigDecimalish(duration)) {
      throw new ErrorException('duration must be a number');
    }

    if (!isBigDecimalish(period)) {
      throw new ErrorException('period must be a number');
    }

    return [
      {
        method: 'evm_increaseBlocks',
        params: [utils.hexValue(BigDecimal.from(duration).div(period).sub(1))],
      },
      {
        method: 'evm_increaseTime',
        params: [utils.hexValue(BigDecimal.from(duration))],
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
