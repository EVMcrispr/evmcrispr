import { utils } from 'ethers';

import type { Action } from '../../../..';

import { SIGNATURE_REGEX } from '../../../../utils';
import { getAbiEntries } from '../../../../utils/abis';
import { fetchImplementationAddress } from '../../../../utils/proxies';
import { BindingsSpace } from '../../../interpreter/BindingsManager';
import { Interpreter } from '../../../interpreter/Interpreter';
import type { CommandFunction } from '../../../types';
import { ComparisonType, checkArgsLength } from '../../../utils';
import { encodeAction } from '../../../utils/encoders';
import type { Std } from '../Std';

const { ABI } = BindingsSpace;
export const exec: CommandFunction<Std> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(c, { type: ComparisonType.Greater, minValue: 3 });

  const targetNode = c.args.shift()!;
  const signatureNode = c.args.shift()!;

  const [targetAddress, signature, params] = await Promise.all([
    interpretNode(targetNode, { allowNotFoundError: true }),
    interpretNode(signatureNode, { treatAsLiteral: true }),
    interpretNodes(c.args),
  ]);

  let finalSignature = signature;

  if (!utils.isAddress(targetAddress)) {
    Interpreter.panic(
      c,
      `expected a valid target address, but got ${targetAddress}`,
    );
  }

  if (!SIGNATURE_REGEX.test(signature)) {
    const abi = module.bindingsManager.getBinding(
      targetAddress,
      ABI,
    ) as utils.Interface;

    if (abi) {
      try {
        finalSignature = abi.getFunction(signature).format('minimal');
      } catch (err) {
        const err_ = err as Error;
        Interpreter.panic(c, err_.message);
      }
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
        Interpreter.panic(c, err_.message);
      }

      if (!fetchedAbi) {
        Interpreter.panic(c, `ABI not found for signature "${signature}"`);
      }

      try {
        finalSignature = fetchedAbi.getFunction(signature).format('minimal');
      } catch (err) {
        const err_ = err as Error;
        Interpreter.panic(
          c,
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

  let execAction: Action;

  try {
    execAction = encodeAction(targetAddress, finalSignature, params);
  } catch (err) {
    const err_ = err as Error;
    Interpreter.panic(c, err_.message);
  }

  return [execAction];
};
