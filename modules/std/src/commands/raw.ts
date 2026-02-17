import type { Abi, TransactionAction } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  resolveEventCaptures,
} from "@evmcrispr/sdk";
import type Std from "..";

const { ABI } = BindingsSpace;

export default defineCommand<Std>({
  name: "raw",
  description: "Send a raw transaction with pre-encoded calldata.",
  args: [
    { name: "contractAddress", type: "address" },
    { name: "data", type: "literal" },
    { name: "value", type: "number", optional: true },
  ],
  opts: [
    { name: "from", type: "address" },
    { name: "gas", type: "number" },
    { name: "max-fee-per-gas", type: "number" },
    { name: "max-priority-fee-per-gas", type: "number" },
    { name: "nonce", type: "number" },
  ],
  async run(
    module,
    { contractAddress, data, value },
    { opts, node, interpreters },
  ) {
    const rawAction: TransactionAction = {
      to: contractAddress,
      data,
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

    const { actionCallback, interpretNode } = interpreters;
    if (node.eventCaptures && node.eventCaptures.length > 0) {
      if (!actionCallback) {
        throw new ErrorException(
          "event capture requires an execution context with transaction access",
        );
      }

      const receipt = await actionCallback(rawAction);

      const contractAbi = module.bindingsManager.getBindingValue(
        contractAddress,
        ABI,
      ) as Abi | undefined;

      await resolveEventCaptures(
        receipt as { logs: any[] },
        contractAbi,
        node.eventCaptures,
        module.bindingsManager,
        interpretNode,
      );

      return [];
    }

    return [rawAction];
  },
});
