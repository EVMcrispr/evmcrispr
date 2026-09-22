import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { smartManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "label-role",
  description:
    "Attach a human-readable label to an AccessManager role (emitted as an event for off-chain indexing).",
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
      name: "label",
      runtime: true,
      type: "string",
      description: "Human-readable role name",
    },
  ],
  async run(_module, { manager, roleId, label }) {
    return [
      encodeAction(manager, "labelRole(uint64,string)", [
        smartManagerRoleId(roleId),
        label,
      ]),
    ];
  },
});
