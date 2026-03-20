import type { TransactionAction } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "raw",
  description: "Send a raw transaction with pre-encoded calldata.",
  args: [
    { name: "contractAddress", type: "address", description: "Target contract address" },
    { name: "data", type: "bytes", description: "ABI-encoded calldata" },
    { name: "value", type: "number", description: "ETH to send (in wei)", optional: true },
  ],
  opts: [
    { name: "from", type: "address", description: "Sender address (requires simulation or connected wallet)" },
    { name: "gas", type: "number", description: "Gas limit" },
    { name: "max-fee-per-gas", type: "number", description: "Max fee per gas (EIP-1559)" },
    { name: "max-priority-fee-per-gas", type: "number", description: "Max priority fee per gas (EIP-1559)" },
    { name: "nonce", type: "number", description: "Transaction nonce override" },
  ],
  async run(
    _module,
    { contractAddress, data, value },
    { opts },
  ) {
    const rawAction: TransactionAction = {
      to: contractAddress,
      ...(data !== "0x" && { data }),
    };

    if (value !== undefined) {
      rawAction.value = BigInt(value);
    }

    if (opts.from) {
      rawAction.from = opts.from;
    }

    if (opts.gas !== undefined) {
      rawAction.gas = BigInt(opts.gas);
    }

    if (opts["max-fee-per-gas"] !== undefined) {
      rawAction.maxFeePerGas = BigInt(opts["max-fee-per-gas"]);
    }

    if (opts["max-priority-fee-per-gas"] !== undefined) {
      rawAction.maxPriorityFeePerGas = BigInt(opts["max-priority-fee-per-gas"]);
    }

    if (opts.nonce !== undefined) {
      rawAction.nonce = Number(opts.nonce);
    }

    return [rawAction];
  },
});
