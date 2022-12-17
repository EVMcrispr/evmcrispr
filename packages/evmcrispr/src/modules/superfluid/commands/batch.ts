import { utils } from 'ethers';

import type { Action } from '../../..';
import { ErrorException, NodeType, isSwitchAction } from '../../..';
import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';
import { CFAv1, host } from '../addresses';

import type { Superfluid } from '../Superfluid';
import type { SuperfluidBatchAction } from '../types';
import { CallCode } from '../types';

export const batch: ICommand<Superfluid> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

    const [blockExpressionNode] = c.args;

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const _host = host.get(String(await module.getChainId()));
    const _cfaV1 = CFAv1.get(String(await module.getChainId()));
    if (!_host || !_cfaV1) {
      throw new ErrorException('Network not supported');
    }

    const actions = (await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
    })) as Action[];

    if (actions.find((a) => isSwitchAction(a))) {
      throw new ErrorException(`can't switch networks inside a batch command`);
    }

    const operations = (actions as SuperfluidBatchAction[]).map((action) => {
      let to: string;
      let data: string;
      if (action.sfBatchType == CallCode.SUPERFLUID_CALL_AGREEMENT) {
        [to, data] = utils.defaultAbiCoder.decode(
          ['address', 'bytes', 'bytes'],
          `0x${action.data.slice(10)}`,
        );
        data = utils.defaultAbiCoder.encode(['bytes', 'bytes'], [data, '0x']);
      } else if (action.sfBatchType == CallCode.CALL_APP_ACTION) {
        to = action.to;
        data = action.data;
      } else {
        to = action.to;
        data = `0x${action.data.slice(10)}`;
      }
      return [action.sfBatchType, to, data];
    });

    return [
      encodeAction(_host, 'batchCall(tuple(uint32,address,bytes)[])', [
        operations,
      ]),
    ];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
