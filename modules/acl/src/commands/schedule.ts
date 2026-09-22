import { defineCommand, encodeAction, Num } from "@evmcrispr/sdk";
import { smartSignatureCall } from "@evmcrispr/sdk/onchain";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "schedule",
  description:
    "Schedule a delayed operation on an AccessManager for later execution with acl:execute-scheduled.",
  args: [
    {
      name: "manager",
      type: "address",
      runtime: true,
      description: "AccessManager address",
    },
    {
      name: "target",
      type: "address",
      runtime: true,
      description: "Managed contract address",
    },
    {
      name: "signature",
      type: "write-abi",
      description: "Function to call on the target",
    },
    {
      name: "params",
      type: "any",
      runtime: true,
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  opts: [
    {
      name: "when",
      type: "number",
      runtime: true,
      description:
        "Unix timestamp at which the operation becomes executable (default 0 = as soon as the delay allows)",
    },
  ],
  async run(_module, { manager, target, signature, params }, { opts }) {
    return [
      encodeAction(manager, "schedule(address,bytes,uint48)", [
        target,
        smartSignatureCall(_module, signature, params ?? []),
        opts.when ?? Num.fromBigInt(0n),
      ]),
    ];
  },
});
