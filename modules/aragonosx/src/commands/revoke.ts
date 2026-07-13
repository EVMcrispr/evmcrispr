import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveTarget } from "../utils/commands";
import { permissionId } from "../utils/permissions";

export default defineCommand<AragonOSx>({
  name: "revoke",
  description:
    "Revoke a permission on the DAO or one of its plugins from an entity.",
  args: [
    {
      name: "who",
      type: "address",
      description: "Address losing the permission (or ANY_ENTITY)",
    },
    {
      name: "where",
      type: "plugin",
      description: "Target: `dao`, a plugin identifier, or an address",
    },
    {
      name: "permission",
      type: "permission",
      description: "Permission name (e.g. EXECUTE) or bytes32 id",
    },
  ],
  async run(module, { who, where, permission }) {
    const dao = module.requireCurrentDAO("revoke");
    const target = resolveTarget(module, where, "revoke");

    return [
      encodeAction(dao.address, "revoke(address,address,bytes32)", [
        target,
        who,
        permissionId(permission),
      ]),
    ];
  },
});
