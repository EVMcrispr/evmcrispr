import { Contract, utils } from "ethers";

import { decodeCallScript } from "../../aragonos/utils";
import type { ICommand } from "../../../types";

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
} from "../../../utils";
import { agentMap, defaultRelayerMap, votingMap } from "../addresses";

import type { Giveth } from "../Giveth";

export const verifyGivbacks: ICommand<Giveth> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Equal, minValue: 2 });
    checkOpts(c, ["relayer"]);

    const [hash, voteId] = await interpretNodes(c.args);

    const chainId = await module.getChainId();
    const voting = votingMap.get(chainId);
    const agent = agentMap.get(chainId);
    const defaultRelayerAddr = defaultRelayerMap.get(chainId);
    if (!voting || !agent || !defaultRelayerAddr) {
      throw new Error(`Givbacks can't be sent for ${chainId} chain`);
    }

    const relayerAddr =
      (await getOptValue(c, "relayer", interpretNode)) || defaultRelayerAddr;

    const votingApp = new Contract(
      voting,
      [
        "function getVote(uint256) public view returns (bool,bool,uint64,uint64,uint64,uint64,uint256,uint256,uint256,bytes)",
        "function forward(bytes) public",
      ],
      await module.getProvider(),
    );

    const relayer = new Contract(
      relayerAddr,
      [
        "function hashBatch(uint256 _nonce, address[] calldata recipients, uint256[] calldata amounts) public view returns (bytes32)",
        "function addBatches(bytes32[],bytes) public",
      ],
      await module.getProvider(),
    );

    const data = await fetch("https://ipfs.blossom.software/ipfs/" + hash).then(
      (data) => data.json(),
    );

    const batches = await Promise.all(
      data.map((batch: any) =>
        relayer.hashBatch(batch.nonce, batch.recipients, batch.amounts),
      ),
    );

    const decodedVoteScript = decodeCallScript(
      (await votingApp.getVote(voteId))[9],
    );

    if (
      decodedVoteScript.length !== 1 ||
      decodedVoteScript[0].to !== agent.toLowerCase()
    ) {
      throw new Error(
        "Vote script does not match script in " +
          hash +
          ". Main call is not to the agent.",
      );
    }

    const decodedAgentScript = decodeCallScript(
      votingApp.interface.decodeFunctionData(
        "forward",
        decodedVoteScript[0].data,
      )[0],
    );

    // if one of the decoded calls is not to the relayer, throw
    if (
      decodedAgentScript.some((call) => call.to !== relayerAddr.toLowerCase())
    ) {
      throw new Error(
        "Vote script does not match script in " +
          hash +
          ". Some calls are not to the relayer.",
      );
    }

    if (decodedAgentScript.length !== 1) {
      throw new Error(
        "Vote script does not match script in " +
          hash +
          ". There are more than one calls to the relayer.",
      );
    }

    const decodedRelayerCall = relayer.interface.decodeFunctionData(
      "addBatches",
      decodedAgentScript[0].data,
    );

    // if the decoded call has not the expected ipfs hash, throw
    if (utils.toUtf8String(decodedRelayerCall[1]) !== hash) {
      throw new Error(
        "Vote script does not match script in " +
          hash +
          ". The IPFS hash do not correspond to the one in the script.",
      );
    }

    // if the decoded call has not the expected batches, throw
    if (
      decodedRelayerCall[0].length !== batches.length ||
      !decodedRelayerCall[0].every(
        (batch: string, i: number) => batch === batches[i],
      )
    ) {
      throw new Error(
        "Vote script does not match script in " +
          hash +
          ". Some calls are not to the expected batch, vis.",
      );
    }

    module.evmcrispr.log("Vote script matches script in " + hash);

    return [encodeAction(voting, "vote(uint256,bool)", [voteId, true])];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
