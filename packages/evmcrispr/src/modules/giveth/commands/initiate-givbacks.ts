import { Contract } from 'ethers';

import type { ICommand } from '../../../types';

import { ComparisonType, checkArgsLength, encodeAction } from '../../../utils';
import { batchForwarderActions } from '../../aragonos/utils';

import type { Giveth } from '../Giveth';

const relayerAddr = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';
const tokenManager = '0x3efac97efa6f237e67b4f8c616a194fd0583d99a';
const voting = '0x30c9aa17fc30e4c23a65680a35b33e8f3b4198a2';
const agent = '0x2fa20fa7fc404d35748497c0f28f8fb2f8731336';

export const initiateGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });

    const [hash] = await interpretNodes(c.args);

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
