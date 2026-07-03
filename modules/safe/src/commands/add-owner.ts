import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import type Safe from "..";
import { getThreshold, toBigInt } from "../utils";

export default defineCommand<Safe>({
  name: "add-owner",
  description:
    "Add an owner to the Safe, optionally updating the threshold (keeps the current one by default).",
  args: [{ name: "owner", type: "address", description: "New owner address" }],
  opts: [
    {
      name: "threshold",
      type: "number",
      description: "New signature threshold (defaults to the current one)",
    },
  ],
  async run(module, { owner }, { opts }) {
    const safe = await module.resolveSafe();

    const threshold =
      opts.threshold !== undefined
        ? toBigInt(opts.threshold)
        : await getThreshold(await module.getClient(), safe);

    return [
      encodeAction(safe, "addOwnerWithThreshold(address,uint256)", [
        owner,
        Num.fromBigInt(threshold),
      ]),
    ];
  },
});
