import { defineHelper } from "@evmcrispr/sdk";
import type AccessControl from "..";
import { accessControlAbi, accessManagerAbi, resolveRole } from "../utils";

export default defineHelper<AccessControl>({
  name: "hasRole",
  batchable: false,
  description:
    "Whether an account holds a role on an AccessControl contract (string roles) or an AccessManager (numeric role ids).",
  returnType: "bool",
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
    { name: "account", type: "address", description: "Account to check" },
  ],
  async run(module, { target, role, account }) {
    const client = await module.getClient();
    const resolved = resolveRole(role);

    if (resolved.system === "access-control") {
      return client.readContract({
        address: target,
        abi: accessControlAbi,
        functionName: "hasRole",
        args: [resolved.role, account],
      });
    }

    const [isMember] = await client.readContract({
      address: target,
      abi: accessManagerAbi,
      functionName: "hasRole",
      args: [resolved.roleId, account],
    });
    return isMember;
  },
});
