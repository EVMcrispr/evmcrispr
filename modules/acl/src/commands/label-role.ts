import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { resolveManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  name: "label-role",
  description:
    "Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing).",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "roleId",
      type: ["number", "string"],
      description: "Role id (or ADMIN_ROLE / PUBLIC_ROLE)",
    },
    { name: "label", type: "string", description: "Human-readable role name" },
  ],
  async run(_module, { manager, roleId, label }) {
    return [
      encodeAction(manager, "labelRole(uint64,string)", [
        Num.fromBigInt(resolveManagerRoleId(roleId)),
        label,
      ]),
    ];
  },
});
