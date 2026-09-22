import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import { amountParam } from "@evmcrispr/sdk/onchain";
import type AccessControl from "..";
import { resolveSmartRole } from "../utils";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "grant",
  description:
    "Grant a role on an AccessControl contract (string roles, hashed with keccak256) or an AccessManager (numeric role ids).",
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
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "account",
      type: "address",
      runtime: true,
      description: "Account to grant to",
    },
  ],
  opts: [
    {
      name: "delay",
      runtime: true,
      type: "number",
      description:
        "Execution delay for the grantee, in time units (e.g. 1d; AccessManager role ids only)",
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
    const resolved = resolveSmartRole(role);

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
        amountParam(resolved.roleId),
        account,
        opts.delay ?? Num.fromBigInt(0n),
      ]),
    ];
  },
});
