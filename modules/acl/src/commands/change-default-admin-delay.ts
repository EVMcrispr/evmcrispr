import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "change-default-admin-delay",
  description:
    "Schedule a change of the delay applied to future default admin transfers.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
    {
      name: "delay",
      type: "number",
      description: "New delay, in time units (e.g. 5d)",
    },
  ],
  async run(_module, { contract, delay }) {
    return [encodeAction(contract, "changeDefaultAdminDelay(uint48)", [delay])];
  },
});
