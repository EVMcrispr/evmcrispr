import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { resolveManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  name: "set-role-admin",
  description:
    "Set the admin role that manages grants and revocations of an AccessManager role.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "roleId",
      type: ["number", "string"],
      description: "Role id (or ADMIN_ROLE / PUBLIC_ROLE)",
    },
    {
      name: "adminRoleId",
      type: ["number", "string"],
      description: "New admin role id",
    },
  ],
  async run(_module, { manager, roleId, adminRoleId }) {
    return [
      encodeAction(manager, "setRoleAdmin(uint64,uint64)", [
        Num.fromBigInt(resolveManagerRoleId(roleId)),
        Num.fromBigInt(resolveManagerRoleId(adminRoleId)),
      ]),
    ];
  },
});
