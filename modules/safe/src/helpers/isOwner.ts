import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress, isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners, safeAbi } from "../utils";

export default defineHelper<Safe>({
  name: "isOwner",
  description:
    "Return whether an address is an owner of a Safe. As @isOwner! the Safe's own isOwner(address) view is read on-chain at assertion time.",
  returnType: "bool",
  batchable: false,
  args: [
    { name: "owner", type: "address", description: "Address to check" },
    {
      name: "safe",
      type: "address",
      optional: true,
      description:
        "Safe address (defaults to the context Safe or connected account)",
    },
  ],
  async run(module, { owner, safe }) {
    const owners = await getOwners(
      await module.getClient(),
      await module.resolveSafe(safe),
    );
    return owners.some((o) => isAddressEqual(o, owner));
  },
  compile: async (ctx, node) => {
    if (node.args.length < 1) {
      throw new ErrorException(
        "@isOwner! expects (owner safe?), e.g. @isOwner!(@me $safe)",
      );
    }
    const owner = String(await ctx.interpreters.interpretNode(node.args[0]));
    const explicit = node.args[1]
      ? String(await ctx.interpreters.interpretNode(node.args[1]))
      : undefined;
    const safe = await (ctx.module as Safe).resolveSafe(explicit as never);
    return directReadOperand(
      ctx,
      safe,
      encodeFunctionData({
        abi: safeAbi,
        functionName: "isOwner",
        args: [getAddress(owner)],
      }),
      "Bool",
    );
  },
});
