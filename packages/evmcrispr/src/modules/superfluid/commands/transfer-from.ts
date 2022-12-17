import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';

import type { Superfluid } from '../Superfluid';
import { CallCode } from '../types';

export const transferFrom: ICommand<Superfluid> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 4 });

    const [token, sender, recipient, amount] = await interpretNodes(c.args);

    return [
      {
        ...encodeAction(token, 'transferFrom(address,address,uint256)', [
          sender,
          recipient,
          amount,
        ]),
        sfBatchType: CallCode.ERC20_TRANSFER_FROM,
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
