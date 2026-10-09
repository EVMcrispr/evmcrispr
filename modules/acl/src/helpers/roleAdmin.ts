import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
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
    // The role decides which of the two access systems is read, so it is
    // fixed when the script is built; the contract may be live.
    const resolved = resolveRole(
      await ctx.interpreters.interpretNode(node.args[1]),
    );
    const target = await readTarget(ctx, "roleAdmin!", node.args[0]);
    if (resolved.system === "access-control") {
      return callReadOperand(
        ctx,
        target,
        getAbiItem({
          abi: accessControlAbi,
          name: "getRoleAdmin",
        }) as AbiFunction,
        [{ value: resolved.role }],
        "Bytes32",
      );
    }
    return callReadOperand(
      ctx,
      target,
      getAbiItem({
        abi: accessManagerAbi,
        name: "getRoleAdmin",
      }) as AbiFunction,
      [{ value: resolved.roleId }],
      "Uint",
    );
  },
});
