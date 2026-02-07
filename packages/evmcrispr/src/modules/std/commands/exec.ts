import type { AbiFunction } from "viem";
import { erc20Abi, getAbiItem, isAddress } from "viem";
import type { HelperFunctionNode } from "../../..";
import { ErrorException } from "../../../errors";
import type { Abi, AbiBinding, Address, ICommand } from "../../../types";
import { BindingsSpace } from "../../../types";
import {
  addressesEqual,
  beforeOrEqualNode,
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getFunctionFragment,
  getOptValue,
  insideNodeLine,
  interpretNodeSync,
  isFunctionSignature,
  isNumberish,
  tryAndCacheNotFound,
} from "../../../utils";
import { fetchAbi } from "../../../utils/abis";
import type { Std } from "../Std";

const { ABI, ADDR } = BindingsSpace;

export const exec: ICommand<Std> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });
    checkOpts(c, ["value", "from"]);

    const [targetNode, signatureNode, ...rest] = c.args;

    const [contractAddress, signature, params] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(signatureNode, { treatAsLiteral: true }),
      interpretNodes(rest),
    ]);

    const value = await getOptValue(c, "value", interpretNode);
    const from = await getOptValue(c, "from", interpretNode);

    let finalSignature = signature;
    let targetAddress: Address = contractAddress;

    if (!isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
      );
    }

    if (from && !isAddress(from)) {
      throw new ErrorException(
        `expected a valid from address, but got ${from}`,
      );
    }

    if (!isFunctionSignature(signature)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(signature)) {
        throw new ErrorException(`invalid signature "${signature}"`);
      }
      const abi = module.bindingsManager.getBindingValue(
        contractAddress,
        ABI,
      ) as Abi | undefined;

      if (abi) {
        const func = getAbiItem({
          abi,
          name: signature,
        });

        finalSignature = getFunctionFragment(func);
      } else {
        let fetchedAbi: Abi;
        try {
          [targetAddress, fetchedAbi] = await fetchAbi(
            contractAddress,
            await module.getClient(),
          );
        } catch (err) {
          const err_ = err as Error;
          throw new ErrorException(
            `an error ocurred while fetching ABI for ${contractAddress} - ${err_.message}`,
          );
        }

        if (!fetchedAbi) {
          throw new ErrorException(
            `ABI not found for signature "${signature}"`,
          );
        }

        try {
          finalSignature = getFunctionFragment(
            getAbiItem({
              abi: fetchedAbi,
              name: signature,
            }),
          );
        } catch (err) {
          const err_ = err as Error;
          throw new ErrorException(
            `error when getting function from ABI - ${err_.message}`,
          );
        }

        module.bindingsManager.setBinding(contractAddress, fetchedAbi, ABI);
        if (!addressesEqual(targetAddress, contractAddress)) {
          module.bindingsManager.setBinding(targetAddress, fetchedAbi, ABI);
        }
      }
    }

    const execAction = encodeAction(targetAddress, finalSignature, params);

    if (value) {
      if (!isNumberish(value)) {
        throw new ErrorException(`expected a valid value, but got ${value}`);
      }
      execAction.value = BigInt(value);
    }

    if (from) {
      execAction.from = from;
    }

    return [execAction];
  },
  buildCompletionItemsForArg(argIndex, nodeArgs, bindingsManager) {
    switch (argIndex) {
      // Contract address and params
      case 0:
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      // Contract method
      case 1: {
        // Check if it's a @token helper and provide ERC-20 functions
        const abi =
          nodeArgs[0].type === "HelperFunctionExpression" &&
          (nodeArgs[0] as HelperFunctionNode).name === "token"
            ? erc20Abi
            : (() => {
                const targetAddress = interpretNodeSync(
                  nodeArgs[0],
                  bindingsManager,
                );
                if (!targetAddress || !isAddress(targetAddress)) {
                  return [];
                }
                const abi = bindingsManager.getBindingValue(targetAddress, ABI);
                if (!abi) {
                  return [];
                }
                return abi;
              })();
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
      !c.args.length ||
      beforeOrEqualNode(c.args[0], caretPos)
    ) {
      return;
    }

    const resolvedTargetAddress = interpretNodeSync(c.args[0], cache);

    if (!resolvedTargetAddress || !isAddress(resolvedTargetAddress)) {
      return;
    }

    const cachedAbi = cache.getBindingValue(
      resolvedTargetAddress,
      BindingsSpace.ABI,
    );

    if (cachedAbi) {
      return (eagerBindingsManager) => {
        eagerBindingsManager.trySetBindings([
          {
            type: BindingsSpace.ABI,
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
};
