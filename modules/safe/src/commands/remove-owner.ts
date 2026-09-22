import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import {
  amountParam,
  getSmartCompileContext,
  isRuntimeValue,
  type SmartAmount,
  smartOperation,
  smartRead,
} from "@evmcrispr/sdk/onchain";
import type Safe from "..";
import {
  findListPredecessor,
  getOwners,
  getThreshold,
  toBigInt,
} from "../utils";

export default defineCommand<Safe>({
  smartSupport: { kind: "runtime" },
  name: "remove-owner",
  description:
    "Remove an owner from the Safe, lowering the threshold if it would exceed the remaining owners.",
  args: [
    { name: "owner", type: "address", description: "Owner address to remove" },
  ],
  opts: [
    {
      name: "threshold",
      runtime: true,
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

    let threshold: SmartAmount;
    if (opts.threshold !== undefined) {
      threshold = isRuntimeValue(opts.threshold)
        ? opts.threshold
        : toBigInt(opts.threshold);
    } else {
      const current = getSmartCompileContext(module)
        ? smartRead(module, safe, "getThreshold() returns (uint256)", [])
        : await getThreshold(client, safe);
      const remaining = BigInt(owners.length - 1);
      threshold = smartOperation(module, "min", current, remaining);
    }

    return [
      encodeAction(safe, "removeOwner(address,address,uint256)", [
        prevOwner,
        owner,
        amountParam(threshold),
      ]),
    ];
  },
});
