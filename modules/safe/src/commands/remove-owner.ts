import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type Safe from "..";
import {
  findListPredecessor,
  getOwners,
  getThreshold,
  toBigInt,
} from "../utils";

export default defineCommand<Safe>({
  name: "remove-owner",
  description:
    "Remove an owner from the Safe, lowering the threshold if it would exceed the remaining owners.",
  args: [
    { name: "owner", type: "address", description: "Owner address to remove" },
  ],
  opts: [
    {
      name: "threshold",
      type: "number",
      description:
        "New signature threshold (defaults to the current one, capped at the remaining owner count)",
    },
  ],
  async run(module, { owner }, { opts }) {
    const safe = await module.resolveSafe();
    const client = await module.getClient();

    const owners = await getOwners(client, safe);
    const prevOwner = findListPredecessor(owners, owner, "owner");

    let threshold: bigint;
    if (opts.threshold !== undefined) {
      threshold = toBigInt(opts.threshold);
    } else {
      const current = await getThreshold(client, safe);
      const remaining = BigInt(owners.length - 1);
      threshold = current > remaining ? remaining : current;
    }

    return [
      encodeAction(safe, "removeOwner(address,address,uint256)", [
        prevOwner,
        owner,
        Num.fromBigInt(threshold),
      ]),
    ];
  },
});
