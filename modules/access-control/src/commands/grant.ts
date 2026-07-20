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
  name: "grant",
  description:
    "Grant a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids).",
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
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "account", type: "address", description: "Account to grant to" },
  ],
  opts: [
    {
      name: "delay",
      type: "number",
      description:
        "Execution delay in seconds for the grantee (AccessManager role ids only)",
    },
  ],
  completions: {
    on: () => [fieldItem("on")],
    to: () => [fieldItem("to")],
  },
  async run(_module, { role, on, target, to, account }, { opts }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const resolved = resolveRole(role);

    if (resolved.system === "access-control") {
      if (opts.delay !== undefined) {
        throw new ErrorException(
          "--delay only applies to AccessManager numeric role ids; AccessControl roles have no execution delay",
        );
      }
      return [
        encodeAction(target, "grantRole(bytes32,address)", [
          resolved.role,
          account,
        ]),
      ];
    }

    return [
      encodeAction(target, "grantRole(uint64,address,uint32)", [
        Num.fromBigInt(resolved.roleId),
        account,
        opts.delay ?? Num.fromBigInt(0n),
      ]),
    ];
  },
});
