import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { smartManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "set-role-admin",
  description:
    "Set the admin role that manages grants and revocations of an AccessManager role.",
  args: [
    {
      name: "manager",
      type: "address",
      runtime: true,
      description: "AccessManager address",
    },
    {
      name: "roleId",
      runtime: true,
      type: ["number", "string"],
      description: "Role id (or ADMIN_ROLE / PUBLIC_ROLE)",
    },
    {
      name: "adminRoleId",
      runtime: true,
      type: ["number", "string"],
      description: "New admin role id",
    },
  ],
  async run(_module, { manager, roleId, adminRoleId }) {
    return [
      encodeAction(manager, "setRoleAdmin(uint64,uint64)", [
        smartManagerRoleId(roleId),
        smartManagerRoleId(adminRoleId),
      ]),
    ];
  },
});
