import { BigNumber, utils } from 'ethers';

import { BindingsSpace } from '../../../types';
import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';

const { ADDR } = BindingsSpace;

export const raw: ICommand<Std> = {
  async run(_, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });

    const targetNode = c.args.shift()!;
    const dataNode = c.args.shift()!;
    const valueNode = c.args.shift();

    const [contractAddress, data, valueBN] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(dataNode, { treatAsLiteral: true }),
      valueNode ? interpretNode(valueNode) : undefined,
    ]);

    if (!utils.isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
      );
    }

    if (valueBN && !BigNumber.isBigNumber(valueBN)) {
      throw new ErrorException(`expected a valid value, but got ${valueBN}`);
    }

    const rawAction = valueBN
      ? {
          to: contractAddress,
          data,
          value: valueBN.toString(),
        }
      : {
          to: contractAddress,
          data,
        };

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
