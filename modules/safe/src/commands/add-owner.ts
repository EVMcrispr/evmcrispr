import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import {
  amountParam,
  getSmartCompileContext,
  isRuntimeValue,
  smartRead,
} from "@evmcrispr/sdk/onchain";
import type Safe from "..";
import { getThreshold, toBigInt } from "../utils";

export default defineCommand<Safe>({
  smartSupport: { kind: "runtime" },
  name: "add-owner",
  description:
    "Add an owner to the Safe, optionally updating the threshold (keeps the current one by default).",
  args: [
    {
      name: "owner",
      type: "address",
      runtime: true,
      description: "New owner address",
    },
  ],
  opts: [
    {
      name: "threshold",
      runtime: true,
      type: "number",
      description: "New signature threshold (defaults to the current one)",
    },
  ],
  async run(module, { owner }, { opts }) {
    const safe = await module.resolveSafe();

    const threshold =
      opts.threshold !== undefined
        ? isRuntimeValue(opts.threshold)
          ? opts.threshold
          : toBigInt(opts.threshold)
        : getSmartCompileContext(module)
          ? smartRead(module, safe, "getThreshold() returns (uint256)", [])
          : await getThreshold(await module.getClient(), safe);

    return [
      encodeAction(safe, "addOwnerWithThreshold(address,uint256)", [
        owner,
        amountParam(threshold),
      ]),
    ];
  },
});
