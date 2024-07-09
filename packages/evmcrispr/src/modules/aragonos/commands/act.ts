import type { AbiFunction } from "viem";
import { isAddress } from "viem";

import type { AbiBinding, ICommand } from "../../../types";
import { BindingsSpace } from "../../../types";
import { batchForwarderActions } from "../utils/forwarders";
import { ErrorException } from "../../../errors";
import {
  ComparisonType,
  SIGNATURE_REGEX,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  encodeAction,
  fetchAbi,
  insideNodeLine,
  interpretNodeSync,
  tryAndCacheNotFound,
} from "../../../utils";
import type { AragonOS } from "../AragonOS";
import { getDAOAppIdentifiers } from "../utils";

const { ABI, ADDR } = BindingsSpace;
export const act: ICommand<AragonOS> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 3,
    });

    const [agentAddress, targetAddress, signature, ...params] =
      await Promise.all(
        c.args.map((arg, i) => {
          if (i < 2) {
            return interpretNode(arg, { allowNotFoundError: true });
          }

          return interpretNode(arg);
        }),
      );

    if (!isAddress(agentAddress)) {
      throw new ErrorException(
        `expected a valid agent address, but got ${agentAddress}`,
      );
    }
    if (!isAddress(targetAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${targetAddress}`,
      );
    }

    if (!SIGNATURE_REGEX.test(signature)) {
      throw new ErrorException(
        `expected a valid signature, but got ${signature}`,
      );
    }

    const execAction = encodeAction(targetAddress, signature, params);

    return batchForwarderActions(module, [execAction], [agentAddress]);
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, bindingsManager) {
    switch (argIndex) {
      case 0: {
        // Return every app on every DAO that includes 'agent'
        return getDAOAppIdentifiers(bindingsManager).filter((appIdentifier) =>
          appIdentifier.includes("agent"),
        );
      }
      case 1: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      case 2: {
        const targetAddress = interpretNodeSync(nodeArgs[1], bindingsManager);

        if (!targetAddress || !isAddress(targetAddress)) {
          return [];
        }

        const abi = bindingsManager.getBindingValue(targetAddress, ABI);

        if (!abi) {
          return [];
        }
        const functions = abi
          // Only consider functions that change state
          .filter(
            (item): item is AbiFunction =>
              item.type === "function" &&
              (item.stateMutability === "nonpayable" ||
                item.stateMutability === "payable"),
          )
          .map(
            (func: AbiFunction) =>
              `${func.name}(${func.inputs.map((input) => input.type).join(",")})`,
          );
        return functions;
      }
      default: {
        if (argIndex >= 2) {
          return bindingsManager.getAllBindingIdentifiers({
            spaceFilters: [ADDR],
          });
        }

        return [];
      }
    }
  },
  async runEagerExecution(c, cache, { client }, caretPos) {
    if (
      !insideNodeLine(c, caretPos) ||
      c.args.length < 2 ||
      beforeOrEqualNode(c.args[1], caretPos)
    ) {
      return;
    }

    const resolvedTargetAddress = interpretNodeSync(c.args[1], cache);

    if (!resolvedTargetAddress || !isAddress(resolvedTargetAddress)) {
      return;
    }

    const cachedAbi = cache.getBindingValue(resolvedTargetAddress, ABI);

    if (cachedAbi) {
      return (eagerBindingsManager) => {
        eagerBindingsManager.trySetBindings([
          {
            type: ABI,
            identifier: resolvedTargetAddress,
            value: cachedAbi,
          },
        ]);
      };
    }

    const result = await tryAndCacheNotFound(
      () =>
        fetchAbi(
          resolvedTargetAddress,
          client,
          // TODO: use etherscan API to fetch the abis
          "",
        ),
      resolvedTargetAddress,
      ABI,
      cache,
    );

    if (!result) {
      return;
    }

    const [targetAddress, abi] = result;
    const addresses = addressesEqual(targetAddress, resolvedTargetAddress)
      ? [resolvedTargetAddress]
      : [resolvedTargetAddress, targetAddress];

    const abiBindings = addresses.map<AbiBinding>((addr) => ({
      type: BindingsSpace.ABI,
      identifier: addr,
      value: abi,
    }));

    // Cache fetched ABIs
    cache.setBindings(abiBindings);

    return (eagerBindingsManager) => {
      eagerBindingsManager.trySetBindings(abiBindings);
    };
  },
};
