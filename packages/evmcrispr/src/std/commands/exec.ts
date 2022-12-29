import { utils } from 'ethers';

import { Interface } from 'ethers/lib/utils';

import type {
  AbiBinding,
  Address,
  HelperFunctionNode,
  ICommand,
} from '../..//types';
import { erc20ABI } from '../../abis';
import { ErrorException } from '../../errors';
import { BindingsSpace } from '../../types';
import {
  ComparisonType,
  SIGNATURE_REGEX,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  checkOpts,
  encodeAction,
  getOptValue,
  insideNodeLine,
  interpretNodeSync,
  isNumberish,
  tryAndCacheNotFound,
} from '../../utils';
import { fetchAbi } from '../../utils/abis';

import type { Std } from '../Std';

const { ABI, ADDR } = BindingsSpace;

export const exec: ICommand<Std> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });
    checkOpts(c, ['value', 'from']);

    const [targetNode, signatureNode, ...rest] = c.args;

    const [contractAddress, signature, params] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(signatureNode, { treatAsLiteral: true }),
      interpretNodes(rest),
    ]);

    const value = await getOptValue(c, 'value', interpretNode);
    const from = await getOptValue(c, 'from', interpretNode);

    let finalSignature = signature;
    let targetAddress: Address = contractAddress;

    if (!utils.isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
      );
    }

    if (from && !utils.isAddress(from)) {
      throw new ErrorException(
        `expected a valid from address, but got ${from}`,
      );
    }

    if (!SIGNATURE_REGEX.test(signature)) {
      const abi = module.bindingsManager.getBindingValue(
        contractAddress,
        ABI,
      ) as utils.Interface;

      if (abi) {
        finalSignature = abi.getFunction(signature).format('minimal');
      } else {
        const etherscanAPI = module.getConfigBinding('etherscanAPI');
        let fetchedAbi: utils.Interface;
        try {
          [targetAddress, fetchedAbi] = await fetchAbi(
            contractAddress,
            await module.getProvider(),
            etherscanAPI,
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
          finalSignature = fetchedAbi.getFunction(signature).format('minimal');
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
      execAction.value = value.toString();
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
        if (
          nodeArgs[0].type === 'HelperFunctionExpression' &&
          (nodeArgs[0] as HelperFunctionNode).name === 'token'
        ) {
          const abi = new Interface(erc20ABI);
          const functions = Object.keys(abi.functions)
            // Only consider functions that change state
            .filter((fnName) => !abi.functions[fnName].constant)
            .map((fnName) => {
              return abi.functions[fnName].format();
            });
          return functions;
        }

        const targetAddress = interpretNodeSync(nodeArgs[0], bindingsManager);

        if (!targetAddress || !utils.isAddress(targetAddress)) {
          return [];
        }

        const abi = bindingsManager.getBindingValue(targetAddress, ABI);

        if (!abi) {
          return [];
        }

        const nonConstantFns = Object.keys(abi.functions)
          // Only consider functions that change state
          .filter((fnName) => !abi.functions[fnName].constant)
          .map((fnName) => {
            return abi.functions[fnName].format();
          });

        return nonConstantFns;
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
  async runEagerExecution(c, cache, { provider }, caretPos) {
    if (
      !insideNodeLine(c, caretPos) ||
      !c.args.length ||
      beforeOrEqualNode(c.args[0], caretPos)
    ) {
      return;
    }

    const resolvedTargetAddress = interpretNodeSync(c.args[0], cache);

    if (!resolvedTargetAddress || !utils.isAddress(resolvedTargetAddress)) {
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
      () =>
        fetchAbi(
          resolvedTargetAddress,
          provider,
          // TODO: use etherscan API to fetch the abis
          '',
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
