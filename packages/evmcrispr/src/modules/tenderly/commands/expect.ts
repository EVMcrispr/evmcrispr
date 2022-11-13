import { BigNumber } from 'ethers';

import { ErrorException } from '../../../errors';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';

import type { Tenderly } from '../Tenderly';

export const expect: ICommand<Tenderly> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 3,
    });

    const [value, operator, expectedValue] = await interpretNodes(c.args);

    let result;

    switch (operator) {
      case '==':
        result = value == expectedValue;
        break;
      case '>':
      case '>=':
      case '<':
      case '<=':
        if (
          !BigNumber.isBigNumber(value) ||
          !BigNumber.isBigNumber(expectedValue)
        ) {
          throw new ErrorException(
            `Operator ${operator} must be used between two numbers`,
          );
        }
        if (operator === '>') result = value.gt(expectedValue);
        if (operator === '>=') result = value.gte(expectedValue);
        if (operator === '<') result = value.lt(expectedValue);
        if (operator === '<=') result = value.lte(expectedValue);
        break;
      default:
        throw new ErrorException();
    }

    module.evmcrispr.log(`${value} ${operator} ${expectedValue}`, result);

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
