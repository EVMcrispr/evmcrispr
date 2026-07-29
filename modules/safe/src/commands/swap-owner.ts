import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Safe from "..";
import { findListPredecessor, getOwners } from "../utils";

export default defineCommand<Safe>({
  name: "swap-owner",
  description: "Replace an owner of the Safe with a new address.",
  args: [
    { name: "oldOwner", type: "address", description: "Owner to replace" },
    { name: "for", type: "command", description: "Keyword `for`" },
    { name: "newOwner", type: "address", description: "New owner address" },
  ],
  completions: { for: () => [fieldItem("for")] },
  async run(module, { oldOwner, for: forKeyword, newOwner }) {
    if (forKeyword !== "for") {
      throw new ErrorException(`expected keyword "for", got "${forKeyword}"`);
    }
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
