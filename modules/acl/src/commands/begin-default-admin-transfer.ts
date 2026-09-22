import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "begin-default-admin-transfer",
  description:
    "Start the delayed two-step transfer of the DEFAULT_ADMIN_ROLE on an AccessControlDefaultAdminRules contract.",
  args: [
    {
      name: "contract",
      type: "address",
      runtime: true,
      description: "AccessControlDefaultAdminRules contract address",
    },
    {
      name: "newAdmin",
      type: "address",
      runtime: true,
      description: "New default admin",
    },
  ],
  async run(_module, { contract, newAdmin }) {
    return [
      encodeAction(contract, "beginDefaultAdminTransfer(address)", [newAdmin]),
    ];
  },
});
