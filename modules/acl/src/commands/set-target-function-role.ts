import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
  normalizeSignature,
} from "@evmcrispr/sdk";
import { toFunctionSelector } from "viem";
import type AccessControl from "..";
import { resolveManagerRoleId } from "../utils";

export default defineCommand<AccessControl>({
  name: "set-target-function-role",
  description:
    "Map functions of a managed contract to the AccessManager role required to call them.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "target",
      type: "address",
      description: "Managed contract address",
    },
    {
      name: "roleId",
      type: ["number", "string"],
      description:
        "Role id required to call the functions (or ADMIN_ROLE / PUBLIC_ROLE)",
    },
    {
      name: "signatures",
      type: "array",
      description: "Function signatures to gate",
    },
  ],
  async run(_module, { manager, target, roleId, signatures }) {
    const selectors = (signatures as unknown[]).map((sig) => {
      if (typeof sig !== "string") {
        throw new ErrorException(
          `<signatures> must contain function signatures, got ${sig}`,
        );
      }
      try {
        return toFunctionSelector(normalizeSignature(sig));
      } catch {
        throw new ErrorException(`invalid function signature: ${sig}`);
      }
    });

    return [
      encodeAction(manager, "setTargetFunctionRole(address,bytes4[],uint64)", [
        target,
        selectors,
        Num.fromBigInt(resolveManagerRoleId(roleId)),
      ]),
    ];
  },
});
