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
  name: "grant",
  description:
    "Grant a permission on the DAO or one of its plugins to an entity, optionally gated by a condition contract.",
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
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "who",
      type: "address",
      description: "Address receiving the permission (or ANY_ENTITY)",
    },
  ],
  opts: [
    {
      name: "condition",
      type: "address",
      description: "PermissionCondition contract gating the permission",
    },
  ],
  completions: {
    on: () => [fieldItem("on")],
    to: () => [fieldItem("to")],
  },
  async run(module, { permission, on, where, to, who }, { opts }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const dao = module.requireCurrentDAO("grant");
    const target = resolveTarget(module, where, "grant");
    const id = permissionId(permission);

    if (opts.condition) {
      return [
        encodeAction(
          dao.address,
          "grantWithCondition(address,address,bytes32,address)",
          [target, who, id, opts.condition],
        ),
      ];
    }

    return [
      encodeAction(dao.address, "grant(address,address,bytes32)", [
        target,
        who,
        id,
      ]),
    ];
  },
});
