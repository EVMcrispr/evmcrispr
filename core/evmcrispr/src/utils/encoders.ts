import { utils } from 'ethers';
import type { Interface } from 'ethers/lib/utils';

import { ErrorInvalid } from '../errors';
import type { Address, TransactionAction } from '../types';

export const encodeAction = (
  target: Address,
  signature: string | Interface,
  params: any[],
): TransactionAction => {
  let fnABI: Interface;

  try {
    if (signature instanceof utils.Interface) {
      fnABI = signature;
    } else {
      const fullSignature = signature.startsWith('function')
        ? signature
        : `function ${signature}`;
      fnABI = new utils.Interface([fullSignature]);
    }
  } catch (err) {
    throw new ErrorInvalid(`Wrong signature format: ${signature}.`);
  }

  return {
    to: target,
    data: encodeCalldata(fnABI, params),
  };
};

export const encodeCalldata = (
  fnInterfaceOrFragment: Interface | utils.Fragment,
  params: unknown[],
): string => {
  const fnInterface = utils.Interface.isInterface(fnInterfaceOrFragment)
    ? fnInterfaceOrFragment
    : new utils.Interface([fnInterfaceOrFragment]);
  const fnFragment = fnInterface.fragments[0];
  const methodName = fnFragment.name;
  const errors: string[] = [];
  const encodedParams: unknown[] = [];

  // Encode parameters individually to generate better error messages
  fnFragment.inputs.forEach((paramType, i) => {
    const { name, type } = paramType;
    try {
      let paramValue = params[i];

      if (
        type.includes('byte') &&
        typeof paramValue === 'string' &&
        !paramValue.startsWith('0x')
      ) {
        paramValue = utils
          .hexlify(utils.toUtf8Bytes(paramValue))
          .padEnd(parseInt(type.match(/^bytes(\d*)$/)![1] || '0') * 2 + 2, '0');
      }
      utils.defaultAbiCoder.encode(
        [paramType.format(utils.FormatTypes.full)],
        [paramValue],
      );
      encodedParams.push(paramValue);
    } catch (err) {
      const err_ = err as Error;
      errors.push(
        `-param ${name ?? i} of type ${type}: ${
          err_.message.split(' (')[0] ?? err_.message
        }. Got ${params[i] ?? 'none'}`,
      );
    }
  });

  if (errors.length) {
    throw new ErrorInvalid(
      `error when encoding ${methodName} call:\n${errors.join('\n')}`,
    );
  }

  /**
   * Need to encode the function call as a whole to take into account previous parameter
   * encodings when generating the offset values of possible dynamic type parameters.
   * See https://docs.soliditylang.org/en/v0.8.16/abi-spec.html#use-of-dynamic-types
   * for more information on how dynamic types are encoded
   */
  return fnInterface.encodeFunctionData(methodName, encodedParams);
};
