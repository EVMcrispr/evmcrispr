import {
  defineCommand,
  encodeAction,
  encodeSignatureCall,
} from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "execute-scheduled",
  description:
    "Execute an operation through an AccessManager, consuming its schedule when the operation was delayed.",
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
      name: "value",
      type: "number",
      description: "ETH to send with the call (in wei)",
    },
  ],
  async run(_module, { manager, target, signature, params }, { opts }) {
    const action = encodeAction(
      manager,
      "execute(address,bytes)",
      [target, encodeSignatureCall(signature, params ?? [])],
      opts.value !== undefined ? { value: BigInt(opts.value) } : undefined,
    );
    return [action];
  },
});
