import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type AccessControl from "..";
import { resolveRole } from "../utils";

export default defineCommand<AccessControl>({
  name: "revoke",
  description:
    "Revoke a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids).",
  args: [
    {
      name: "role",
      type: ["number", "string"],
      description:
        "Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id",
    },
    { name: "on", type: "command", description: "Keyword `on`" },
    {
      name: "target",
      type: "address",
      description: "AccessControl contract or AccessManager address",
    },
    { name: "from", type: "command", description: "Keyword `from`" },
    { name: "account", type: "address", description: "Account to revoke from" },
  ],
  completions: {
    on: () => [fieldItem("on")],
    from: () => [fieldItem("from")],
  },
  async run(_module, { role, on, target, from, account }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    if (from !== "from") {
      throw new ErrorException(`expected keyword "from", got "${from}"`);
    }
    const resolved = resolveRole(role);

    if (resolved.system === "access-control") {
      return [
        encodeAction(target, "revokeRole(bytes32,address)", [
          resolved.role,
          account,
        ]),
      ];
    }

    return [
      encodeAction(target, "revokeRole(uint64,address)", [
        Num.fromBigInt(resolved.roleId),
        account,
      ]),
    ];
  },
});
