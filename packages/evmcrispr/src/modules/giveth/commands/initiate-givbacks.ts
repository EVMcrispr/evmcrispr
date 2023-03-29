import { Contract } from 'ethers';

import type { ICommand } from '../../../types';

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from '../../../utils';
import { batchForwarderActions } from '../../aragonos/utils';
import { agent, defaultRelayerAddr, tokenManager, voting } from '../addresses';

import type { Giveth } from '../Giveth';

export const initiateGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });
    checkOpts(c, ['relayer']);

    const [hash] = await interpretNodes(c.args);
    const relayerAddr =
      (await getOptValue(c, 'relayer', interpretNode)) || defaultRelayerAddr;

    const data = await fetch('https://ipfs.blossom.software/ipfs/' + hash).then(
      (data) => data.json(),
    );

    const relayer = new Contract(
      relayerAddr,
      [
        'function hashBatch(uint256 _nonce, address[] calldata recipients, uint256[] calldata amounts) public view returns (bytes32)',
      ],
      await module.getProvider(),
    );

    const batches = await Promise.all(
      data.map((batch: any) =>
        relayer.hashBatch(batch.nonce, batch.recipients, batch.amounts),
      ),
    );

    const actions = await batchForwarderActions(
      module,
      [
        encodeAction(relayerAddr, 'addBatches(bytes32[],bytes)', [
          batches,
          hash,
        ]),
      ],
      [agent, voting, tokenManager],
    );
    return actions;
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
