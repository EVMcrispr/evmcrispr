import { utils } from 'ethers';
import type { Fragment, Interface } from 'ethers/lib/utils';

import type { Action, Address } from '../..';

const getFnSelector = (fragment: Fragment): string =>
  utils.id(fragment.format('sighash')).substring(0, 10);

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
    throw new Error(`Wrong signature format: ${signature}.`);
  }

  const fnFragment = fnABI.fragments[0];
  const errors: string[] = [];

  const encodedParams = fnFragment.inputs.reduce(
    (encodedParams, paramType, i) => {
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
            .padEnd(
              parseInt(type.match(/^bytes(\d*)$/)![1] || '0') * 2 + 2,
              '0',
            );
        }
        const p = fnABI._encodeParams([paramType], [paramValue]);
        return encodedParams + p.slice(2);
      } catch (err) {
        const err_ = err as Error;
        errors.push(
          `Error encoding param ${name ?? i} of type ${type}: ${err_.message}`,
        );
      }

      return encodedParams;
    },
    '',
  );

  return {
    to: target,
    data: `${getFnSelector(fnFragment)}${encodedParams}`,
  };
};
