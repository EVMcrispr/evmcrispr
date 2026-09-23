import { defineCommand } from "@evmcrispr/sdk";
import { zeroAddress } from "viem";
import type Safe from "..";
import { encodeGuardChange } from "../utils";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason:
      "This command has no value arguments; it emits the fixed guard removal call chosen by --module.",
  },
  name: "remove-guard",
  description:
    "Remove the transaction guard of the Safe, or with --module its module guard (Safe v1.5.0 or later).",
  args: [],
  opts: [
    {
      name: "module",
      type: "bool",
      description:
        "Remove the module guard instead of the transaction guard (Safe v1.5.0 or later, or upgraded by safe:upgrade earlier in the block)",
    },
  ],
  async run(module, _args, { opts }) {
    return [
      await encodeGuardChange(
        module,
        "safe:remove-guard",
        zeroAddress,
        !!opts.module,
      ),
    ];
  },
});
