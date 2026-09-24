import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Swaps from "..";
import { integer } from "../twap/cow";
import { resolveReference } from "../twap/reference";
import { twapSnapshot } from "../twap/status";
import { activeSimMode } from "../utils/sim";

export default defineHelper<Swaps>({
  name: "twapParts",
  description:
    "JSON page of TWAP parts with exact UIDs, trading windows, submission observations and verified settlement receipts. Offset defaults to 0; limit defaults to 100 (maximum 128).",
  returnType: "string",
  batchable: false,
  args: [
    {
      name: "order",
      type: "bytes32",
      description: "Order hash bound by swaps:twap",
    },
    {
      name: "offset",
      type: "number",
      optional: true,
      description: "Zero-based part offset (default: 0)",
    },
    {
      name: "limit",
      type: "number",
      optional: true,
      description: "Parts to return (default: 100, maximum: 128)",
    },
  ],
  async run(module, { order, offset, limit }) {
    const ref = await resolveReference(module, order);
    const start = integer(offset ?? "0", "offset");
    const count = integer(limit ?? "100", "limit");
    if (start > 0xffffffffn || count < 1n || count > 128n)
      throw new ErrorException(
        "TWAP offset must fit uint32 and limit must be between 1 and 128",
      );
    const snapshot = await twapSnapshot(
      await module.getClient(),
      ref,
      { external: !activeSimMode(module) },
      { offset: Number(start), limit: Number(count) },
    );
    return JSON.stringify({
      items: snapshot.items,
      offset: snapshot.offset,
      nextOffset: snapshot.nextOffset,
      totalParts: snapshot.status.totalParts,
      evidence: snapshot.status.evidence,
    });
  },
});
