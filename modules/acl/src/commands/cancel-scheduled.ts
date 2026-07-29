import {
  defineCommand,
  encodeAction,
  encodeSignatureCall,
} from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "cancel-scheduled",
  description:
    "Cancel a scheduled AccessManager operation. Callable by its scheduler, a guardian of the required role, or an admin.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "caller",
      type: "address",
      description: "Account that scheduled the operation",
    },
    {
      name: "target",
      type: "address",
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
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  async run(_module, { manager, caller, target, signature, params }) {
    return [
      encodeAction(manager, "cancel(address,address,bytes)", [
        caller,
        target,
        encodeSignatureCall(signature, params ?? []),
      ]),
    ];
  },
});
