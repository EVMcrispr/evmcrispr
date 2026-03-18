import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Giveth from "..";
import { defaultRelayerMap } from "../addresses";

export default defineCommand<Giveth>({
  name: "finalize-givbacks",
  description: "Finalize a GIVbacks distribution by executing batches from IPFS.",
  args: [{ name: "hash", type: "any", description: "IPFS hash of the distribution data" }],
  opts: [{ name: "relayer", type: "any", description: "Relayer address for transaction submission" }],
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
});
