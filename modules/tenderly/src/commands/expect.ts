import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  checkArgsLength,
  isNumberish,
} from '@1hive/evmcrispr';
import type { ICommand } from '@1hive/evmcrispr';
import { BigNumber } from 'ethers';

import type { Tenderly } from '../Tenderly';

const { USER } = BindingsSpace;

function oppositeOp(operator: string): string {
  switch (operator) {
    case '==':
      return '!=';
    case '!=':
      return '==';
    case '>':
      return '<=';
    case '>=':
      return '<';
    case '<':
      return '>=';
    case '<=':
      return '>';
    default:
      throw new ErrorException(`Operator ${operator} not recognized`);
  }
}

export const expect: ICommand<Tenderly> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 3,
    });

    const [valueNode, , expectedValueNode] = c.args;

    const [value, operator, expectedValue] = await interpretNodes(c.args);

    let result;

    switch (operator) {
      case '==':
        result = value == expectedValue;
        break;
      case '!=':
        result = value != expectedValue;
        break;
      case '>':
      case '>=':
      case '<':
      case '<=':
        if (!isNumberish(value) || !isNumberish(expectedValue)) {
          throw new ErrorException(
            `Operator ${operator} must be used between two numbers`,
          );
        }
        if (operator === '>') result = BigNumber.from(value).gt(expectedValue);
        if (operator === '>=')
          result = BigNumber.from(value).gte(expectedValue);
        if (operator === '<') result = BigNumber.from(value).lt(expectedValue);
        if (operator === '<=')
          result = BigNumber.from(value).lte(expectedValue);
        break;
      default:
        throw new ErrorException(`Operator ${operator} not recognized`);
    }

    module.evmcrispr.log(
      `${result ? ':success: Success' : ':error: Assertion error'}: expected ${
        valueNode.value ?? value
      } ${operator} ${expectedValueNode.value ?? expectedValue}${
        !result
          ? `, but ${value} ${oppositeOp(operator)} ${expectedValue}.`
          : ''
      }`,
    );

    if (!result) {
      throw new ErrorException('An assertion failed.');
    }
    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0:
        return cache.getAllBindingIdentifiers({ spaceFilters: [USER] });
      case 1:
        return ['==', '!=', '<', '<=', '>', '>='];
      case 2: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [USER] });
      }
      default:
        return [];
    }
  },
};
