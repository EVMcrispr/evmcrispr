import type { ICommand } from '@1hive/evmcrispr';

import {
  ComparisonType,
  IPFS_GATEWAY,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from '@1hive/evmcrispr';
import { Contract } from 'ethers';

import type { Giveth } from '../Giveth';
import { batchForwarderActions } from '../utils';
import { DEFAULT_GIVBACKS_RELAYER } from '../utils/giveth';

const ARAGON_DAO_TOKEN_MANAGER = '0x3efac97efa6f237e67b4f8c616a194fd0583d99a';
const ARAGON_DAO_VOTING = '0x30c9aa17fc30e4c23a65680a35b33e8f3b4198a2';
const ARAGON_DAO_AGENT = '0x2fa20fa7fc404d35748497c0f28f8fb2f8731336';

export const initiateGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 1 });
    checkOpts(c, ['relayer']);

    const [hash] = await interpretNodes(c.args);
    const relayerAddr =
      (await getOptValue(c, 'relayer', interpretNode)) ||
      DEFAULT_GIVBACKS_RELAYER;

    const data = await fetch(IPFS_GATEWAY + hash).then((data) => data.json());

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
      [ARAGON_DAO_AGENT, ARAGON_DAO_VOTING, ARAGON_DAO_TOKEN_MANAGER],
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
