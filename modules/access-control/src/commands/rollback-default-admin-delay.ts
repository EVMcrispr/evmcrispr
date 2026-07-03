import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "rollback-default-admin-delay",
  description: "Cancel a scheduled default admin delay change.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "rollbackDefaultAdminDelay()", [])];
  },
});
