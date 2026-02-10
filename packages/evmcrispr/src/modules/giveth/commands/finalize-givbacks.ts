import { defineCommand, encodeAction } from "../../../utils";
import { defaultRelayerMap } from "../addresses";

import type { Giveth } from "../Giveth";

export const finalizeGivbacks = defineCommand<Giveth>({
  args: [{ name: "hash", type: "any" }],
  opts: [{ name: "relayer", type: "any" }],
  async run(module, { hash }, { opts }) {
    const defaultRelayerAddr = defaultRelayerMap.get(await module.getChainId());

    if (!defaultRelayerAddr) {
      throw new Error(
        `No default relayer for chain ${await module.getChainId()}`,
      );
    }

    const relayerAddr = opts.relayer || defaultRelayerAddr;

    const batches = await fetch(
      `https://ipfs.blossom.software/ipfs/${hash}`,
    ).then((data) => data.json());
    return batches.map((batch: any) =>
      encodeAction(relayerAddr, "executeBatch(uint256,address[],uint256[])", [
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
});
