import {
  defineCommand,
  encodeAction,
  encodeSignatureCall,
  Num,
} from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "schedule",
  description:
    "Schedule a delayed operation on an AccessManager for later execution with access-control:execute-scheduled.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "target",
      type: "address",
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
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  opts: [
    {
      name: "when",
      type: "number",
      description:
        "Unix timestamp at which the operation becomes executable (default 0 = as soon as the delay allows)",
    },
  ],
  async run(_module, { manager, target, signature, params }, { opts }) {
    return [
      encodeAction(manager, "schedule(address,bytes,uint48)", [
        target,
        encodeSignatureCall(signature, params ?? []),
        opts.when ?? Num.fromBigInt(0n),
      ]),
    ];
  },
});
