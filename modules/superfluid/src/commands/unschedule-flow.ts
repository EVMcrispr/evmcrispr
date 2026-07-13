import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { FLOW_SCHEDULER } from "../addresses";
import { requireCore, requirePeripheral } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "unschedule-flow",
  description:
    "Cancel a pending flow schedule (both its start and end legs). Streams already opened keep running — use stop-stream for those.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "receiver", type: "address", description: "Scheduled receiver" },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { token, to, receiver }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const scheduler = requirePeripheral(
      FLOW_SCHEDULER,
      chainId,
      "FlowScheduler",
    );
    const superToken = await resolveSuperToken(module, token);
    return [
      encodeAction(scheduler, "deleteFlowSchedule(address,address,bytes)", [
        superToken,
        receiver,
        "0x",
      ]),
    ];
  },
});
