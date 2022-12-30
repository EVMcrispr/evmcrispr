import {
  ComparisonType,
  IPFS_GATEWAY,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from '@1hive/evmcrispr';
import type { ICommand } from '@1hive/evmcrispr';

import type { Giveth } from '../Giveth';
import { DEFAULT_GIVBACKS_RELAYER } from '../utils';

export const finalizeGivbacks: ICommand<Giveth> = {
  async run(_, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });
    checkOpts(c, ['relayer']);

    const [hash] = await interpretNodes(c.args);
    const relayerAddr =
      (await getOptValue(c, 'relayer', interpretNode)) ||
      DEFAULT_GIVBACKS_RELAYER;

    const batches = await fetch(IPFS_GATEWAY + hash).then((data) =>
      data.json(),
    );
    return batches.map((batch: any) =>
      encodeAction(relayerAddr, 'executeBatch(uint256,address[],uint256[])', [
        batch.nonce,
        batch.recipients,
        batch.amounts,
      ]),
    );
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
