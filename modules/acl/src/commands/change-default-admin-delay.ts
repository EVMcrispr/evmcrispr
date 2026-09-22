import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "change-default-admin-delay",
  description:
    "Schedule a change of the delay applied to future default admin transfers.",
  args: [
    {
      name: "contract",
      type: "address",
      runtime: true,
      description: "AccessControlDefaultAdminRules contract address",
    },
    {
      name: "delay",
      type: "number",
      runtime: true,
      description: "New delay, in time units (e.g. 5d)",
    },
  ],
  async run(_module, { contract, delay }) {
    return [encodeAction(contract, "changeDefaultAdminDelay(uint48)", [delay])];
  },
});
