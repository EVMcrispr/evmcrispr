import { Contract } from 'ethers';

import { ErrorException } from '../../..';

import type { ICommand } from '../../../types';

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from '../../../utils';
import { batchForwarderActions } from '../../aragonos/utils';

import type { Giveth } from '../Giveth';

const defaultRelayerAddr = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';
const votingAddr = '0x30c9aa17fc30e4c23a65680a35b33e8f3b4198a2';
const agentAddr = '0x2fa20fa7fc404d35748497c0f28f8fb2f8731336';

export const verifyGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 1,
      maxValue: 2,
    });
    checkOpts(c, ['relayer', 'vote-if-correct']);

    const [hash, _voteId] = await interpretNodes(c.args);
    const relayerAddr =
      (await getOptValue(c, 'relayer', interpretNode)) || defaultRelayerAddr;
    const voteIfCorrect = await getOptValue(
      c,
      'vote-if-correct',
      interpretNode,
    );

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

    const voting = new Contract(
      votingAddr,
      [
        'function votesLength() public view returns (uint256)',
        'function canVote(uint256 _voteId, address _voter) public view returns (bool)',
        'function getVote(uint256 _voteId) public view returns (bool open, bool executed, uint64 startDate, uint64 snapshotBlock, uint64 supportRequired, uint64 minAcceptQuorum, uint256 yea, uint256 nay, uint256 votingPower, bytes script)',
      ],
      await module.getProvider(),
    );

    const votesLength = await voting.votesLength();

    if (votesLength.eq('0')) {
      throw new ErrorException('Vote does not exist');
    }

    const voteId = _voteId ? _voteId : votesLength.sub(1);

    const { script } = await voting.getVote(voteId);

    const batches = await Promise.all(
      data.map((batch: any) =>
        relayer.hashBatch(batch.nonce, batch.recipients, batch.amounts),
      ),
    );

    const [action] = await batchForwarderActions(
      module,
      [
        encodeAction(relayerAddr, 'addBatches(bytes32[],bytes)', [
          batches,
          hash,
        ]),
      ],
      [agentAddr, votingAddr],
    );

    if (script == action.data) {
      module.evmcrispr.log(
        `:success: Vote #${voteId} correspond to data in https://ipfs.blossom.software/ipfs/${hash}`,
      );
      if (voteIfCorrect) {
        if (await voting.canVote(voteId, await module.getConnectedAccount())) {
          return [
            encodeAction(votingAddr, 'vote(uint256,bool,bool)', [
              voteId,
              true,
              true,
            ]),
          ];
        } else {
          throw new ErrorException(
            `Cannot vote on #${voteId}. Voting account may not have permissions, or vote may be already closed.`,
          );
        }
      }
    } else {
      module.evmcrispr.log(
        `:error: Vote #${voteId} does not correspond to data in https://ipfs.blossom.software/ipfs/${hash}`,
      );
    }

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
