import { ErrorException } from "../../../errors";
import type { Abi, TransactionAction } from "../../../types";
import { BindingsSpace } from "../../../types";
import { defineCommand } from "../../../utils";
import { resolveEventCaptures } from "../../../utils/events";
import type { Std } from "../Std";

const { ABI, ADDR } = BindingsSpace;

export const raw = defineCommand<Std>({
  args: [
    {
      name: "contractAddress",
      type: "address",
      interpretOptions: { allowNotFoundError: true },
    },
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

    // Handle event captures: dispatch action, decode receipt logs, store variables
    const { actionCallback, interpretNode } = interpreters;
    if (node.eventCaptures && node.eventCaptures.length > 0) {
      if (!actionCallback) {
        throw new ErrorException(
          "event capture requires an execution context with transaction access",
        );
      }

      const receipt = await actionCallback(rawAction);

      // Look up the contract ABI for name-only event captures
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

      return []; // action already dispatched
    }

    return [rawAction];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      case 0:
      case 1:
      case 2:
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      default:
        return [];
    }
  },
});
