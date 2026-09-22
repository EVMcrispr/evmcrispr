import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "disconnect-pool",
  description:
    "Disconnect the sender from a GDA pool. Earnings keep accruing but no longer count toward the real-time balance until claimed or reconnected.",
  args: [
    {
      name: "pool",
      runtime: true,
      type: "address",
      description: "GDA pool address",
    },
  ],
  async run(module, { pool }) {
    await requireCore(module);
    return [
      encodeAction(GDA_FORWARDER, "disconnectPool(address,bytes)", [
        pool,
        "0x",
      ]),
    ];
  },
});
