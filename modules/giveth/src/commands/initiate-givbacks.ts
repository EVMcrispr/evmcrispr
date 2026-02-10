import { batchForwarderActions } from "@evmcrispr/module-aragonos/utils";

import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { parseAbiItem } from "viem";
import type Giveth from "..";
import {
  agentMap,
  defaultRelayerMap,
  tokenManagerMap,
  votingMap,
} from "../addresses";

export default defineCommand<Giveth>({
  name: "initiate-givbacks",
  args: [{ name: "hash", type: "any" }],
  opts: [{ name: "relayer", type: "any" }],
  async run(module, { hash }, { opts }) {
    const chainId = await module.getChainId();
    const tokenManager = tokenManagerMap.get(chainId);
    const voting = votingMap.get(chainId);
    const agent = agentMap.get(chainId);
    const defaultRelayerAddr = defaultRelayerMap.get(chainId);
    if (!tokenManager || !voting || !agent || !defaultRelayerAddr) {
      throw new Error(`Givbacks can't be sent for ${chainId} chain`);
    }

    const relayerAddr = opts.relayer || defaultRelayerAddr;

    const data = await fetch(`https://ipfs.blossom.software/ipfs/${hash}`).then(
      (data) => data.json(),
    );

    const client = await module.getClient();

    const batches = await Promise.all(
      data.map((batch: any) =>
        client.readContract({
          address: relayerAddr,
          abi: [
            parseAbiItem(
              "function hashBatch(uint256 _nonce, address[] calldata recipients, uint256[] calldata amounts) public view returns (bytes32)",
            ),
          ],
          functionName: "hashBatch",
          args: [batch.nonce, batch.recipients, batch.amounts],
        }),
      ),
    );

    const actions = await batchForwarderActions(
      module,
      [
        encodeAction(relayerAddr, "addBatches(bytes32[],bytes)", [
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
});
