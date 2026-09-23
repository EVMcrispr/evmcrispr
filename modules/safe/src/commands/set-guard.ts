import { defineCommand } from "@evmcrispr/sdk";
import type Safe from "..";
import { encodeGuardChange } from "../utils";

export default defineCommand<Safe>({
  smartSupport: { kind: "runtime" },
  name: "set-guard",
  description:
    "Set the transaction guard of the Safe, a contract that checks every owner transaction before and after execution (e.g. a Zodiac ScopeGuard), or with --module its module guard (Safe v1.5.0 or later), which checks every module transaction.",
  args: [
    {
      name: "guard",
      type: "address",
      runtime: true,
      description: "Guard contract address",
    },
  ],
  opts: [
    {
      name: "module",
      type: "bool",
      description:
        "Set the module guard instead of the transaction guard (Safe v1.5.0 or later, or upgraded by safe:upgrade earlier in the block)",
    },
  ],
  async run(module, { guard }, { opts }) {
    return [
      await encodeGuardChange(module, "safe:set-guard", guard, !!opts.module),
    ];
  },
});
