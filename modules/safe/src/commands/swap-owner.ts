import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";
import { findListPredecessor, getOwners } from "../utils";

export default defineCommand<Safe>({
  name: "swap-owner",
  description: "Replace an owner of the Safe with a new address.",
  args: [
    { name: "oldOwner", type: "address", description: "Owner to replace" },
    { name: "newOwner", type: "address", description: "New owner address" },
  ],
  async run(module, { oldOwner, newOwner }) {
    const safe = await module.resolveSafe();

    const owners = await getOwners(await module.getClient(), safe);
    const prevOwner = findListPredecessor(owners, oldOwner, "owner");

    return [
      encodeAction(safe, "swapOwner(address,address,address)", [
        prevOwner,
        oldOwner,
        newOwner,
      ]),
    ];
  },
});
