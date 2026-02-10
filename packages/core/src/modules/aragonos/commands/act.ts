import type { AbiFunction } from "viem";
import { isAddress } from "viem";
import { ErrorException } from "../../../errors";
import type { AbiBinding } from "../../../types";
import { BindingsSpace } from "../../../types";
import {
  addressesEqual,
  beforeOrEqualNode,
  defineCommand,
  encodeAction,
  fetchAbi,
  getFunctionFragment,
  insideNodeLine,
  interpretNodeSync,
  isFunctionSignature,
  tryAndCacheNotFound,
} from "../../../utils";
import type { AragonOS } from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

const { ABI, ADDR } = BindingsSpace;
export default defineCommand<AragonOS>({
  name: "act",
  args: [
    {
      name: "agent",
      type: "address",
      interpretOptions: { allowNotFoundError: true },
    },
    {
      name: "target",
      type: "address",
      interpretOptions: { allowNotFoundError: true },
    },
    { name: "signature", type: "string" },
    { name: "params", type: "any", rest: true },
  ],
  async run(
    module,
    { agent: agentAddress, target: targetAddress, signature, params },
  ) {
    if (!isFunctionSignature(signature)) {
      throw new ErrorException(
        `<signature> must be a valid function signature, got ${signature}`,
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
          .map((func: AbiFunction) =>
            getFunctionFragment(func)
              .replace("function ", "")
              .replace(/ returns \(.*\)/, ""),
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
      () => fetchAbi(resolvedTargetAddress, client),
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
});
