import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";

export default defineCommand<Superfluid>({
  name: "connect-pool",
  description:
    "Connect the sender to a GDA pool so pool earnings count toward the real-time balance automatically. Disconnected members still accrue but must claim explicitly.",
  args: [{ name: "pool", type: "address", description: "GDA pool address" }],
  async run(module, { pool }) {
    await requireCore(module);
    return [
      encodeAction(GDA_FORWARDER, "connectPool(address,bytes)", [pool, "0x"]),
    ];
  },
});
