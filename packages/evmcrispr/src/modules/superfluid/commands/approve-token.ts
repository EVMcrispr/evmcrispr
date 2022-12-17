import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';

import type { Superfluid } from '../Superfluid';
import { CallCode } from '../types';

export const approveToken: ICommand<Superfluid> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 3 });

    const [token, spender, amount] = await interpretNodes(c.args);

    return [
      {
        ...encodeAction(token, 'approve(address,uint256)', [spender, amount]),
        sfBatchType: CallCode.ERC20_APPROVE,
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
