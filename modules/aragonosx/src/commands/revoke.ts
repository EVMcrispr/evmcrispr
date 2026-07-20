import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveTarget } from "../utils/commands";
import { permissionId } from "../utils/permissions";

export default defineCommand<AragonOSx>({
  name: "revoke",
  description:
    "Revoke a permission on the DAO or one of its plugins from an entity.",
  args: [
    {
      name: "permission",
      type: "permission",
      description: "Permission name (e.g. EXECUTE) or bytes32 id",
    },
    { name: "on", type: "command", description: "Keyword `on`" },
    {
      name: "where",
      type: "plugin",
      description: "Target: `dao`, a plugin identifier, or an address",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
    {
      name: "who",
      type: "address",
      description: "Address losing the permission (or ANY_ENTITY)",
    },
  ],
  completions: {
    on: () => [fieldItem("on")],
    from: () => [fieldItem("from")],
  },
  async run(module, { permission, on, where, from, who }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
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
