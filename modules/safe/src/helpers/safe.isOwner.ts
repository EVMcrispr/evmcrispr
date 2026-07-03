import { defineHelper } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners } from "../utils";

export default defineHelper<Safe>({
  name: "safe.isOwner",
  description: "Return whether an address is an owner of a Safe.",
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
});
