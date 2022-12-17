import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';

import type { Giveth } from '../Giveth';

export const finalizeGivbacks: ICommand<Giveth> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

    const [hash] = await interpretNodes(c.args);

    const batches = await fetch(
      'https://ipfs.blossom.software/ipfs/' + hash,
    ).then((data) => data.json());
    const relayerAddr = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';
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
