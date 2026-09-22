import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { smartManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "set-role-guardian",
  description:
    "Set the guardian role allowed to cancel scheduled operations of an AccessManager role.",
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
      name: "guardianRoleId",
      runtime: true,
      type: ["number", "string"],
      description: "New guardian role id",
    },
  ],
  async run(_module, { manager, roleId, guardianRoleId }) {
    return [
      encodeAction(manager, "setRoleGuardian(uint64,uint64)", [
        smartManagerRoleId(roleId),
        smartManagerRoleId(guardianRoleId),
      ]),
    ];
  },
});
