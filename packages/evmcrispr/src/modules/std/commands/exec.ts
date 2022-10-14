import { utils } from 'ethers';

import { BindingsSpace } from '../../../types';
import type { AbiBinding, Address, ICommand } from '../../../types';

import {
  ComparisonType,
  SIGNATURE_REGEX,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  encodeAction,
  insideNodeLine,
  interpretNodeSync,
} from '../../../utils';
import { fetchAbi } from '../../../utils/abis';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';

const { ABI, ADDR } = BindingsSpace;

export const exec: ICommand<Std> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });

    const targetNode = c.args.shift()!;
    const signatureNode = c.args.shift()!;

    const [contractAddress, signature, params] = await Promise.all([
      interpretNode(targetNode, { allowNotFoundError: true }),
      interpretNode(signatureNode, { treatAsLiteral: true }),
      interpretNodes(c.args),
    ]);

    let finalSignature = signature;
    let targetAddress: Address = contractAddress;

    if (!utils.isAddress(contractAddress)) {
      throw new ErrorException(
        `expected a valid target address, but got ${contractAddress}`,
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
            module.signer.provider!,
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
        const value = interpretNodeSync(nodeArgs[0], bindingsManager);
        if (!value || !utils.isAddress(value)) {
          return [];
        }
        const abi = bindingsManager.getBindingValue(value, ABI);
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

    const value = interpretNodeSync(c.args[0], cache);

    if (!value || !utils.isAddress(value)) {
      return;
    }

    const cachedAbi = cache.getBindingValue(value, BindingsSpace.ABI);

    if (cachedAbi) {
      return (eagerBindingsManager) => {
        eagerBindingsManager.mergeBindings([
          {
            type: BindingsSpace.ABI,
            identifier: value,
            value: cachedAbi,
          },
        ]);
      };
    }

    const [targetAddress, abi] = await fetchAbi(value, provider, '');

    const addresses = addressesEqual(targetAddress, value)
      ? [value]
      : [value, targetAddress];

    return (eagerBindingsManager) => {
      const abiBindings = addresses.map<AbiBinding>((addr) => ({
        type: BindingsSpace.ABI,
        identifier: addr,
        value: abi,
      }));

      eagerBindingsManager.mergeBindings(abiBindings);
    };
  },
};
