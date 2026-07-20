import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { resolveManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  name: "set-role-guardian",
  description:
    "Set the guardian role allowed to cancel scheduled operations of an AccessManager role.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "roleId",
      type: ["number", "string"],
      description: "Role id (or ADMIN_ROLE / PUBLIC_ROLE)",
    },
    {
      name: "guardianRoleId",
      type: ["number", "string"],
      description: "New guardian role id",
    },
  ],
  async run(_module, { manager, roleId, guardianRoleId }) {
    return [
      encodeAction(manager, "setRoleGuardian(uint64,uint64)", [
        Num.fromBigInt(resolveManagerRoleId(roleId)),
        Num.fromBigInt(resolveManagerRoleId(guardianRoleId)),
      ]),
    ];
  },
});
