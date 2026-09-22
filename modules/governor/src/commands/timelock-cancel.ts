import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Governor from "..";

export default defineCommand<Governor>({
  smartSupport: { kind: "runtime" },
  name: "timelock-cancel",
  description:
    "Cancel a pending TimelockController operation. The sender needs the CANCELLER_ROLE.",
  args: [
    {
      name: "timelock",
      type: "address",
      runtime: true,
      description: "TimelockController address",
    },
    {
      name: "operationId",
      type: "bytes32",
      runtime: true,
      description: "Operation id (bound by governor:timelock-schedule)",
    },
  ],
  async run(_module, { timelock, operationId }) {
    return [encodeAction(timelock, "cancel(bytes32)", [operationId])];
  },
});
