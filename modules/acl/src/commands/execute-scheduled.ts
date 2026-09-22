import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { isRuntimeValue, smartSignatureCall } from "@evmcrispr/sdk/onchain";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  smartSupport: { kind: "runtime" },
  name: "execute-scheduled",
  description:
    "Execute an operation through an AccessManager, consuming its schedule when the operation was delayed.",
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
      name: "value",
      type: "number",
      runtime: true,
      description: "ETH to send with the call (in wei)",
    },
  ],
  async run(_module, { manager, target, signature, params }, { opts }) {
    const action = encodeAction(
      manager,
      "execute(address,bytes)",
      [target, smartSignatureCall(_module, signature, params ?? [])],
      opts.value !== undefined
        ? {
            value: isRuntimeValue(opts.value) ? opts.value : BigInt(opts.value),
          }
        : undefined,
    );
    return [action];
  },
});
