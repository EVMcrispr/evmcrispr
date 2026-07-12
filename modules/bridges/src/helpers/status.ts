import { defineHelper, ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type Bridges from "..";
import { ADAPTERS } from "../adapters/registry";
import type { BridgeAdapter } from "../adapters/types";
import { resolveChainId } from "../argTypes";
import {
  assertTxHash,
  findSourceReceipt,
  type SourceTx,
} from "../utils/receipts";

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

export default defineHelper<Bridges>({
  name: "status",
  batchable: false,
  description:
    "Progress of a bridge transfer: pending, claimable, done, or unknown. Poll it with `loop until` to wait for a transfer to become claimable or arrive.",
  returnType: "string",
  args: [
    {
      name: "transferId",
      type: "string",
      description: "Transaction hash of the bridge on the source chain",
    },
    {
      name: "adapter",
      type: "bridge-adapter",
      optional: true,
      description:
        "Adapter that initiated the transfer (default: detected from the source transaction)",
    },
    {
      name: "fromChain",
      type: "chain",
      optional: true,
      description:
        "Source chain of the transfer (default: probed across supported chains)",
    },
  ],
  async run(module, { transferId, adapter, fromChain }) {
    const hash = assertTxHash(String(transferId));
    const src = await findSourceReceipt(
      module,
      hash,
      fromChain !== undefined ? resolveChainId(fromChain) : undefined,
    );

    // Status is a pure lookup on an existing transfer: the adapter is named
    // directly rather than resolved against a lane, because the script is
    // usually still on the source chain.
    let bridge: BridgeAdapter | undefined;
    if (adapter) {
      bridge = ADAPTERS[String(adapter).toLowerCase()];
      if (!bridge) {
        const known = Object.values(ADAPTERS)
          .map((a) => a.name)
          .join(", ");
        throw new ErrorNotFound(
          `unknown bridge adapter "${adapter}" (known: ${known})`,
        );
      }
    } else {
      bridge = detectAdapter(src);
    }

    if (!bridge) {
      throw new ErrorException(
        `couldn't tell which bridge produced ${hash}; pass the adapter as the second argument`,
      );
    }

    return bridge.status(module, src);
  },
});
