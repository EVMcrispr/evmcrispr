import {
  defineCommand,
  encodeAction,
  parseSignatureParamTypes,
} from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "exec",
  description:
    "Call a contract function, encoding the arguments from its signature.",
  args: [
    { name: "contractAddress", type: "address", description: "Target contract address" },
    { name: "signature", type: "write-abi", description: "Function signature (e.g. `\"transfer(address,uint256)\"`)" },
    {
      name: "params",
      type: "any", description: "Arguments matching the signature types",
      rest: true,
      resolveType: (ctx) => {
        const sigNode = ctx.nodeArgs[1];
        if (!sigNode?.value) return "any";
        const paramTypes = parseSignatureParamTypes(sigNode.value);
        const paramIndex = ctx.argIndex - 2;
        return paramTypes[paramIndex] ?? "any";
      },
    },
  ],
  opts: [
    { name: "value", type: "number", description: "ETH to send with the call (in wei)" },
    { name: "from", type: "address", description: "Sender address (requires simulation or connected wallet)" },
    { name: "gas", type: "number", description: "Gas limit" },
    { name: "max-fee-per-gas", type: "number", description: "Max fee per gas (EIP-1559)" },
    { name: "max-priority-fee-per-gas", type: "number", description: "Max priority fee per gas (EIP-1559)" },
    { name: "nonce", type: "number", description: "Transaction nonce override" },
  ],
  async run(
    _module,
    { contractAddress, signature, params },
    { opts },
  ) {
    const execAction = encodeAction(contractAddress, signature, params);

    if (opts.value !== undefined) {
      execAction.value = BigInt(opts.value);
    }

    if (opts.from) {
      execAction.from = opts.from;
    }

    if (opts.gas !== undefined) {
      execAction.gas = BigInt(opts.gas);
    }

    if (opts["max-fee-per-gas"] !== undefined) {
      execAction.maxFeePerGas = BigInt(opts["max-fee-per-gas"]);
    }

    if (opts["max-priority-fee-per-gas"] !== undefined) {
      execAction.maxPriorityFeePerGas = BigInt(
        opts["max-priority-fee-per-gas"],
      );
    }

    if (opts.nonce !== undefined) {
      execAction.nonce = Number(opts.nonce);
    }

    return [execAction];
  },
});
