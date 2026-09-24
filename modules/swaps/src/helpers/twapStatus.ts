import { defineHelper } from "@evmcrispr/sdk";
import type Swaps from "..";
import { resolveReference } from "../twap/reference";
import { resolveTwap } from "../twap/registry";
import { activeSimMode } from "../utils/sim";

export default defineHelper<Swaps>({
  name: "twapStatus",
  description:
    "JSON TWAP status: independent registration, schedule, verified settlement totals, evidence coverage/finality, indexer discovery and current-part submission. Incomplete history reports unknown; expiry never proves fills.",
  returnType: "string",
  batchable: false,
  args: [
    {
      name: "order",
      type: "bytes32",
      description: "Order hash bound by swaps:twap",
    },
  ],
  async run(module, { order }) {
    const ref = await resolveReference(module, order);
    const provider = await resolveTwap(module, ref.provider);
    return JSON.stringify(
      await provider.status(await module.getClient(), ref, {
        external: !activeSimMode(module),
      }),
    );
  },
});
