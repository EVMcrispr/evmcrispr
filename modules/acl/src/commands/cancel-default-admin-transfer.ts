import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "cancel-default-admin-transfer",
  description:
    "Cancel a pending default admin transfer. Must be sent by the current default admin.",
  args: [
    {
      name: "contract",
      type: "address",
      runtime: true,
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "cancelDefaultAdminTransfer()", [])];
  },
});
