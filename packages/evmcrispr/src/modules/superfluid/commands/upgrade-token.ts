import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';

import type { Superfluid } from '../Superfluid';
import { CallCode } from '../types';

export const upgradeToken: ICommand<Superfluid> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 2 });

    const [token, amount] = await interpretNodes(c.args);

    return [
      {
        ...encodeAction(token, 'upgrade(uint256)', [amount]),
        sfBatchType: CallCode.SUPERTOKEN_UPGRADE,
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
