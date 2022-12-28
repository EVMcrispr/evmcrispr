import type { AbiBinding, ICommand } from '@1hive/evmcrispr';
import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  SIGNATURE_REGEX,
  addressesEqual,
  beforeOrEqualNode,
  checkArgsLength,
  encodeAction,
  fetchAbi,
  insideNodeLine,
  interpretNodeSync,
  tryAndCacheNotFound,
} from '@1hive/evmcrispr';
import { utils } from 'ethers';

import type { AragonOS } from '../AragonOS';
import { getDAOAppIdentifiers } from '../utils';
import { batchForwarderActions } from '../utils/forwarders';

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

    if (!utils.isAddress(agentAddress)) {
      throw new ErrorException(
        `expected a valid agent address, but got ${agentAddress}`,
      );
    }
    if (!utils.isAddress(targetAddress)) {
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
          appIdentifier.includes('agent'),
        );
      }
      case 1: {
        return bindingsManager.getAllBindingIdentifiers({
          spaceFilters: [ADDR],
        });
      }
      case 2: {
        const targetAddress = interpretNodeSync(nodeArgs[1], bindingsManager);

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
      c.args.length < 2 ||
      beforeOrEqualNode(c.args[1], caretPos)
    ) {
      return;
    }

    const resolvedTargetAddress = interpretNodeSync(c.args[1], cache);

    if (!resolvedTargetAddress || !utils.isAddress(resolvedTargetAddress)) {
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
