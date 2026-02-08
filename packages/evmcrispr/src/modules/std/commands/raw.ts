import { isAddress } from "viem";
import { ErrorException } from "../../../errors";
import type { Abi, ICommand, TransactionAction } from "../../../types";
import { BindingsSpace } from "../../../types";
import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  getOptValue,
  isNumberish,
} from "../../../utils";
import { resolveEventCaptures } from "../../../utils/events";
import type { Std } from "../Std";

const { ABI, ADDR } = BindingsSpace;

export const raw: ICommand<Std> = {
  async run(module, c, { interpretNode, actionCallback }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });
    checkOpts(c, [
      "from",
      "gas",
      "max-fee-per-gas",
      "max-priority-fee-per-gas",
      "nonce",
    ]);

    const [targetNode, dataNode, valueNode] = c.args;

    const [contractAddress, data, value] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(dataNode, { treatAsLiteral: true }),
      valueNode ? interpretNode(valueNode) : undefined,
    ]);

    const from = await getOptValue(c, "from", interpretNode);
    const gas = await getOptValue(c, "gas", interpretNode);
    const maxFeePerGas = await getOptValue(c, "max-fee-per-gas", interpretNode);
    const maxPriorityFeePerGas = await getOptValue(
      c,
      "max-priority-fee-per-gas",
      interpretNode,
    );
    const nonce = await getOptValue(c, "nonce", interpretNode);

    if (!isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
      );
    }

    if (value && !isNumberish(value)) {
      throw new ErrorException(`expected a valid value, but got ${value}`);
    }

    if (from && !isAddress(from)) {
      throw new ErrorException(
        `expected a valid from address, but got ${from}`,
      );
    }

    const rawAction: TransactionAction = {
      to: contractAddress,
      data,
    };

    if (value) {
      rawAction.value = BigInt(value);
    }

    if (from) {
      rawAction.from = from;
    }

    if (gas) {
      if (!isNumberish(gas)) {
        throw new ErrorException(`expected a valid gas limit, but got ${gas}`);
      }
      rawAction.gas = BigInt(gas);
    }

    if (maxFeePerGas) {
      if (!isNumberish(maxFeePerGas)) {
        throw new ErrorException(
          `expected a valid max fee per gas, but got ${maxFeePerGas}`,
        );
      }
      rawAction.maxFeePerGas = BigInt(maxFeePerGas);
    }

    if (maxPriorityFeePerGas) {
      if (!isNumberish(maxPriorityFeePerGas)) {
        throw new ErrorException(
          `expected a valid max priority fee per gas, but got ${maxPriorityFeePerGas}`,
        );
      }
      rawAction.maxPriorityFeePerGas = BigInt(maxPriorityFeePerGas);
    }

    if (nonce) {
      if (!isNumberish(nonce)) {
        throw new ErrorException(`expected a valid nonce, but got ${nonce}`);
      }
      rawAction.nonce = Number(nonce);
    }

    // Handle event captures: dispatch action, decode receipt logs, store variables
    if (c.eventCaptures && c.eventCaptures.length > 0) {
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
        c.eventCaptures,
        module.bindingsManager,
        interpretNode,
      );

      return []; // action already dispatched
    }

    return [rawAction];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      // Contract address
      case 0:
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      // Transaction data
      case 1: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      // Value
      case 2: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      default: {
        return [];
      }
    }
  },
  async runEagerExecution() {
    return;
  },
};
