import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand, readTarget } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem } from "viem";
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
  compile: async (ctx, node) => {
    // The role decides which of the two access systems is read, so it is
    // fixed when the script is built; the contract and the account may be
    // live.
    const resolved = resolveRole(
      await ctx.interpreters.interpretNode(node.args[1]),
    );
    const target = await readTarget(ctx, "hasRole!", node.args[0]);
    if (resolved.system === "access-control") {
      return callReadOperand(
        ctx,
        target,
        getAbiItem({ abi: accessControlAbi, name: "hasRole" }) as AbiFunction,
        [{ value: resolved.role }, node.args[2]],
        "Bool",
      );
    }
    // AccessManager returns (isMember, executionDelay): word 0.
    return callReadOperand(
      ctx,
      target,
      getAbiItem({ abi: accessManagerAbi, name: "hasRole" }) as AbiFunction,
      [{ value: resolved.roleId }, node.args[2]],
      "Bool",
      0n,
    );
  },
});
