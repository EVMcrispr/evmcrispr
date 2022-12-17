import { BigNumber, utils } from 'ethers';

import type { Action, TransactionAction } from '../../..';
import { ErrorException, NodeType, isSwitchAction } from '../../..';
import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';

import type { Safe } from '../Safe';

const multiSendCallOnlyContract = '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D';
const txType = 0; // We use the type 'call', which is 0

function encodeMultiSend(actions: TransactionAction[]): string {
  return actions.reduce((script: string, { to, data, value }) => {
    const _data = utils.arrayify(data);
    const encoded = utils.solidityPack(
      ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
      [txType, to, value || 0, _data.length, _data],
    );
    return script + encoded.slice(2);
  }, '0x');
}

function aggregateValue(actions: TransactionAction[]): string {
  return actions
    .reduce(
      (total: BigNumber, { value }) => (value ? total.add(value) : total),
      BigNumber.from(0),
    )
    .toString();
}

export const multisend: ICommand<Safe> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

    const [blockExpressionNode] = c.args;

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const actions = (await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
    })) as Action[];

    if (actions.find((a) => isSwitchAction(a))) {
      throw new ErrorException(
        `can't switch networks inside a connect command`,
      );
    }

    const encodedActions = encodeMultiSend(actions as TransactionAction[]);
    const value = aggregateValue(actions as TransactionAction[]);

    return [
      {
        ...encodeAction(multiSendCallOnlyContract, 'multiSend(bytes)', [
          encodedActions,
        ]),
        value,
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
