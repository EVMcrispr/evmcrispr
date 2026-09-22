import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { smartSignatureCall } from "@evmcrispr/sdk/onchain";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "cancel-scheduled",
  description:
    "Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin.",
  args: [
    {
      name: "manager",
      type: "address",
      runtime: true,
      description: "AccessManager address",
    },
    {
      name: "caller",
      type: "address",
      runtime: true,
      description: "Account that scheduled the operation",
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
      description: "Function of the scheduled call",
    },
    {
      name: "params",
      type: "any",
      runtime: true,
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  async run(_module, { manager, caller, target, signature, params }) {
    return [
      encodeAction(manager, "cancel(address,address,bytes)", [
        caller,
        target,
        smartSignatureCall(_module, signature, params ?? []),
      ]),
    ];
  },
});
