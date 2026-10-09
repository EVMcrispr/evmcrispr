import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners, safeAbi } from "../utils";
import { safeTarget } from "../utils/onchain";

export default defineHelper<Safe>({
  name: "isOwner",
  description: "Whether an address is an owner of a Safe.",
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
    // Both the Safe and the address asked about may be live.
    return callReadOperand(
      ctx,
      await safeTarget(ctx, "isOwner!", node.args[1]),
      getAbiItem({ abi: safeAbi, name: "isOwner" }) as AbiFunction,
      [node.args[0]],
      "Bool",
    );
  },
});
