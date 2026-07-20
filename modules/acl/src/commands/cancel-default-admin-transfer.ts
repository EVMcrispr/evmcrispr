import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "cancel-default-admin-transfer",
  description:
    "Cancel a pending default admin transfer. Must be sent by the current default admin.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "cancelDefaultAdminTransfer()", [])];
  },
});
