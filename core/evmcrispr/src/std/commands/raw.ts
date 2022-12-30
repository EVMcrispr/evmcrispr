import { utils } from 'ethers';

import { ErrorException } from '../../errors';
import { BindingsSpace } from '../../types';
import type { ICommand, TransactionAction } from '../../types';
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
  isNumberish,
} from '../../utils';
import type { Std } from '../Std';

const { ADDR } = BindingsSpace;

export const raw: ICommand<Std> = {
  async run(_, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });
    checkOpts(c, ['from']);

    const [targetNode, dataNode, valueNode] = c.args;

    const [contractAddress, data, value] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(dataNode, { treatAsLiteral: true }),
      valueNode ? interpretNode(valueNode) : undefined,
    ]);

    const from = await getOptValue(c, 'from', interpretNode);

    if (!utils.isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
      );
    }

    if (value && !isNumberish(value)) {
      throw new ErrorException(`expected a valid value, but got ${value}`);
    }

    if (from && !utils.isAddress(from)) {
      throw new ErrorException(
        `expected a valid from address, but got ${from}`,
      );
    }

    const rawAction: TransactionAction = {
      to: contractAddress,
      data,
    };

    if (value) {
      rawAction.value = value.toString();
    }

    if (from) {
      rawAction.from = from;
    }

    return [rawAction];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      // Contract address
      case 0:
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      // Transaction data
      case 1: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      // Value
      case 2: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      default: {
        return [];
      }
    }
  },
  async runEagerExecution() {
    return;
  },
};
