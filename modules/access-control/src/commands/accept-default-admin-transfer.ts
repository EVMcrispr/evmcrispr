import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "accept-default-admin-transfer",
  description:
    "Accept a pending default admin transfer after its schedule has passed. Must be sent by the pending admin.",
  args: [
    {
      name: "contract",
      type: "address",
      description: "AccessControlDefaultAdminRules contract address",
    },
  ],
  async run(_module, { contract }) {
    return [encodeAction(contract, "acceptDefaultAdminTransfer()", [])];
  },
});
