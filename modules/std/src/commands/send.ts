import type { TransactionAction } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "send",
  description:
    "Send a low-level transaction. Provide [to] for a call/transfer, --data for raw calldata, --value for native value, or any combination.",
  args: [
    {
      name: "to",
      type: "address",
      optional: true,
      description:
        "Target address. Omit for a CREATE-style deployment (use the `deploy` command for address binding).",
    },
  ],
  opts: [
    {
      name: "data",
      type: "bytes",
      description: "Pre-encoded calldata or init code",
    },
    {
      name: "value",
      type: "number",
      description: "Native value to send (in wei)",
    },
    {
      name: "from",
      type: "address",
      description: "Sender address (requires simulation or connected wallet)",
    },
    { name: "gas", type: "number", description: "Gas limit" },
    {
      name: "max-fee-per-gas",
      type: "number",
      description: "Max fee per gas (EIP-1559)",
    },
    {
      name: "max-priority-fee-per-gas",
      type: "number",
      description: "Max priority fee per gas (EIP-1559)",
    },
    {
      name: "nonce",
      type: "number",
      description: "Transaction nonce override",
    },
  ],
  async run(_module, { to }, { opts }) {
    const data = opts.data as `0x${string}` | undefined;

    if (!to && !data) {
      throw new ErrorException(
        "send requires <to> or --data (use the `deploy` command for contract creation with address binding)",
      );
    }

    const action: TransactionAction = {};
    if (to) action.to = to;
    if (data && data !== "0x") action.data = data;

    if (opts.value !== undefined) {
      action.value = BigInt(opts.value);
    }
    if (opts.from) {
      action.from = opts.from;
    }
    if (opts.gas !== undefined) {
      action.gas = BigInt(opts.gas);
    }
    if (opts["max-fee-per-gas"] !== undefined) {
      action.maxFeePerGas = BigInt(opts["max-fee-per-gas"]);
    }
    if (opts["max-priority-fee-per-gas"] !== undefined) {
      action.maxPriorityFeePerGas = BigInt(opts["max-priority-fee-per-gas"]);
    }
    if (opts.nonce !== undefined) {
      action.nonce = Number(opts.nonce);
    }

    return [action];
  },
});
