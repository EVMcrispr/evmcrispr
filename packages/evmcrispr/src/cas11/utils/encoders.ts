import { utils } from 'ethers';
import type { Interface } from 'ethers/lib/utils';

import { ErrorInvalid } from '../../errors';
import type { Action, Address } from '../..';

export const encodeAction = (
  target: Address,
  signature: string,
  params: any[],
): Action => {
  let fnABI: Interface;
  const fullSignature = signature.startsWith('function')
    ? signature
    : `function ${signature}`;
  try {
    fnABI = new utils.Interface([fullSignature]);
  } catch (err) {
    console.log(err);
    throw new ErrorInvalid(`Wrong signature format: ${signature}.`);
  }

  return {
    to: target,
    data: encodeCalldata(fnABI, signature.split('(')[0], params),
  };
};

export const encodeCalldata = (
  fnABI: Interface,
  methodName: string,
  params: any[],
): string => {
  const fnFragment = fnABI.getFunction(methodName);
  const errors: string[] = [];

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
      fnABI._encodeParams([paramType], [paramValue]);
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
  return fnABI.encodeFunctionData(methodName, params);
};
