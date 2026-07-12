import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Bridges from "..";
import { ADAPTERS, resolveAdapter } from "../adapters/registry";
import type { BridgeAdapter } from "../adapters/types";
import { resolveChainId } from "../argTypes";
import {
  assertTxHash,
  findSourceReceipt,
  type SourceTx,
} from "../utils/receipts";
import { activeSimMode } from "../utils/sim";

/** Match the source receipt's logs against each adapter's watched topics. */
function detectAdapter(src: SourceTx): BridgeAdapter | undefined {
  const topics = new Set(
    src.logs.flatMap((l) => (l.topics?.[0] ? [l.topics[0].toLowerCase()] : [])),
  );
  const addresses = new Set(src.logs.map((l) => l.address.toLowerCase()));

  return Object.values(ADAPTERS).find((adapter) => {
    const events = adapter.relayHandler?.sourceEvents(src.chainId) ?? [];
    return events.some(
      (event) =>
        topics.has(event.topic.toLowerCase()) &&
        (!event.address || addresses.has(event.address.toLowerCase())),
    );
  });
}

export default defineCommand<Bridges>({
  name: "claim",
  description:
    "Finalize a two-step bridge on the destination chain: mint a CCTP transfer once Circle has attested it, or prove and finalize a canonical L2 withdrawal. Run it after switching to the destination chain.",
  args: [
    {
      name: "transferId",
      type: "string",
      description: "Transaction hash of the bridge on the source chain",
    },
  ],
  opts: [
    {
      name: "using",
      type: "bridge-adapter",
      description:
        "Adapter that initiated the transfer (default: detected from the source transaction)",
    },
    {
      name: "from-chain",
      type: "chain",
      description:
        "Source chain of the transfer (default: probed across supported chains)",
    },
  ],
  batchable: true,
  async run(module, { transferId }, { opts }) {
    if (activeSimMode(module)) {
      throw new ErrorException(
        "the simulation auto-relays bridge transfers when you switch to the destination chain, so claim is unnecessary inside sim:fork",
      );
    }

    const hash = assertTxHash(String(transferId));
    const fromChain = opts["from-chain"]
      ? resolveChainId(opts["from-chain"])
      : undefined;
    const src = await findSourceReceipt(module, hash, fromChain);
    const dstChainId = await module.getChainId();

    const using = opts.using as string | undefined;
    const adapter = using
      ? await resolveAdapter(module, using, {
          srcChainId: src.chainId,
          dstChainId,
        })
      : detectAdapter(src);

    if (!adapter) {
      throw new ErrorException(
        `couldn't tell which bridge produced ${hash}; pass --using <adapter>`,
      );
    }
    if (!adapter.buildClaim) {
      throw new ErrorException(
        `${adapter.name} transfers don't need a claim step`,
      );
    }

    return adapter.buildClaim(module, src, dstChainId);
  },
});
