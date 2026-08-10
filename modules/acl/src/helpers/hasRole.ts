import { defineHelper } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress } from "viem";
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
    const [target, role, account] = await Promise.all(
      node.args.map((n) => ctx.interpreters.interpretNode(n)),
    );
    const resolved = resolveRole(role);
    if (resolved.system === "access-control") {
      return directReadOperand(
        ctx,
        getAddress(String(target)),
        encodeFunctionData({
          abi: accessControlAbi,
          functionName: "hasRole",
          args: [resolved.role, getAddress(String(account))],
        }),
        "Bool",
      );
    }
    // AccessManager returns (isMember, executionDelay): word 0.
    return directReadOperand(
      ctx,
      getAddress(String(target)),
      encodeFunctionData({
        abi: accessManagerAbi,
        functionName: "hasRole",
        args: [resolved.roleId, getAddress(String(account))],
      }),
      "Bool",
      0n,
    );
  },
});
