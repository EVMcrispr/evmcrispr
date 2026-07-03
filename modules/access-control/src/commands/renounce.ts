import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { resolveRole } from "../utils";

export default defineCommand<AccessControl>({
  name: "renounce",
  description:
    "Renounce a role held by the connected account on an AccessControl contract or an AccessManager.",
  args: [
    {
      name: "target",
      type: "address",
      description: "AccessControl contract or AccessManager address",
    },
    {
      name: "role",
      type: ["number", "string"],
      description:
        "Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id",
    },
  ],
  async run(module, { target, role }) {
    const resolved = resolveRole(role);
    // v5 renounceRole takes the caller's own address as confirmation
    const account = await module.getConnectedAccount();

    if (resolved.system === "access-control") {
      return [
        encodeAction(target, "renounceRole(bytes32,address)", [
          resolved.role,
          account,
        ]),
      ];
    }

    return [
      encodeAction(target, "renounceRole(uint64,address)", [
        Num.fromBigInt(resolved.roleId),
        account,
      ]),
    ];
  },
});
