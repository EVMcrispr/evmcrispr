import { defineHelper, Num } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
import type AccessControl from "..";
import { accessControlAbi, accessManagerAbi, resolveRole } from "../utils";

export default defineHelper<AccessControl>({
  name: "roleAdmin",
  batchable: false,
  description:
    "Admin role that controls a role: a bytes32 value on AccessControl contracts, a role id on AccessManagers.",
  returnType: ["bytes32", "number"],
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
    const client = await module.getClient();
    const resolved = resolveRole(role);

    if (resolved.system === "access-control") {
      return client.readContract({
        address: target,
        abi: accessControlAbi,
        functionName: "getRoleAdmin",
        args: [resolved.role],
      });
    }

    const adminRoleId = await client.readContract({
      address: target,
      abi: accessManagerAbi,
      functionName: "getRoleAdmin",
      args: [resolved.roleId],
    });
    return Num.fromBigInt(adminRoleId);
  },
  compile: async (ctx, node) => {
    const [target, role] = await Promise.all(
      node.args.map((n) => ctx.interpreters.interpretNode(n)),
    );
    const resolved = resolveRole(role);
    if (resolved.system === "access-control") {
      return directReadOperand(
        ctx,
        getAddress(String(target)),
        encodeFunctionData({
          abi: accessControlAbi,
          functionName: "getRoleAdmin",
          args: [resolved.role],
        }),
        "Bytes32",
      );
    }
    return directReadOperand(
      ctx,
      getAddress(String(target)),
      encodeFunctionData({
        abi: accessManagerAbi,
        functionName: "getRoleAdmin",
        args: [resolved.roleId],
      }),
      "Uint",
    );
  },
});
