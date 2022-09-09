import { utils } from 'ethers';

import type { CommandFunction } from '../../../types';

import {
  ComparisonType,
  SIGNATURE_REGEX,
  checkArgsLength,
  encodeAction,
} from '../../../utils';
import { getAbiEntries } from '../../../utils/abis';
import { fetchImplementationAddress } from '../../../utils/proxies';
import { BindingsSpace } from '../../../BindingsManager';
import type { Std } from '../Std';
import { ErrorException } from '../../../errors';

const { ABI } = BindingsSpace;

export const exec: CommandFunction<Std> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(c, { type: ComparisonType.Greater, minValue: 2 });

  const targetNode = c.args.shift()!;
  const signatureNode = c.args.shift()!;

  const [targetAddress, signature, params] = await Promise.all([
    interpretNode(targetNode, { allowNotFoundError: true }),
    interpretNode(signatureNode, { treatAsLiteral: true }),
    interpretNodes(c.args),
  ]);

  let finalSignature = signature;

  if (!utils.isAddress(targetAddress)) {
    throw new ErrorException(
      `expected a valid target address, but got ${targetAddress}`,
    );
  }

  if (!SIGNATURE_REGEX.test(signature)) {
    const abi = module.bindingsManager.getBinding(
      targetAddress,
      ABI,
    ) as utils.Interface;

    if (abi) {
      finalSignature = abi.getFunction(signature).format('minimal');
    } else {
      const implementationAddress = await fetchImplementationAddress(
        targetAddress,
        module.signer.provider!,
      );
      const etherscanAPI = module.getConfigBinding('etherscanAPI');
      let fetchedAbi: utils.Interface;
      try {
        fetchedAbi = await getAbiEntries(
          etherscanAPI,
          implementationAddress ?? targetAddress,
          await module.signer.getChainId(),
        );
      } catch (err) {
        const err_ = err as Error;
        throw new ErrorException(
          `an error ocurred while fetching ABI for ${
            implementationAddress ?? targetAddress
          } - ${err_.message}`,
        );
      }

      if (!fetchedAbi) {
        throw new ErrorException(`ABI not found for signature "${signature}"`);
      }

      try {
        finalSignature = fetchedAbi.getFunction(signature).format('minimal');
      } catch (err) {
        const err_ = err as Error;
        throw new ErrorException(
          `error when getting function from ABI - ${err_.message}`,
        );
      }

      module.bindingsManager.setBinding(targetAddress, fetchedAbi, ABI);
      if (implementationAddress) {
        module.bindingsManager.setBinding(
          implementationAddress,
          fetchedAbi,
          ABI,
        );
      }
    }
  }

  const execAction = encodeAction(targetAddress, finalSignature, params);

  return [execAction];
};
