import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam } from "@evmcrispr/sdk/onchain";
import type AccessControl from "..";
import { resolveSmartRole } from "../utils";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "renounce",
  description:
    "Renounce a role held by the connected account on an AccessControl contract or an AccessManager.",
  args: [
    {
      name: "role",
      runtime: true,
      type: ["number", "string"],
      description:
        "Role name (e.g. MINTER_ROLE), bytes32 value, or AccessManager role id; runtime roles must be bytes32 or integers",
    },
    { name: "on", type: "command", description: "Keyword `on`" },
    {
      name: "target",
      type: "address",
      runtime: true,
      description: "AccessControl contract or AccessManager address",
    },
  ],
  completions: { on: () => [fieldItem("on")] },
  async run(module, { role, on, target }) {
    if (on !== "on") {
      throw new ErrorException(`expected keyword "on", got "${on}"`);
    }
    const resolved = resolveSmartRole(role);
    // v5 renounceRole takes the caller's own address as confirmation
    const account = await module.getSender();

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
        amountParam(resolved.roleId),
        account,
      ]),
    ];
  },
});
