import { BigNumber } from 'ethers';

import type { EVMcrispr } from '../../..';

function process(
  operator: '*' | '/' | '+' | '-',
  resolve: (number: string) => BigNumber,
  parts: (string | null)[],
): string[] {
  const opFunc = {
    '*': (a: string, b: string) => resolve(a).mul(resolve(b)).toString(),
    '/': (a: string, b: string) => resolve(a).div(resolve(b)).toString(),
    '+': (a: string, b: string) => resolve(a).add(resolve(b)).toString(),
    '-': (a: string, b: string) => resolve(a).sub(resolve(b)).toString(),
  };
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === operator) {
      let prev = i - 1;
      while (parts[prev] === null) {
        prev--;
      }
      let pos = i + 1;
      while (parts[pos] === null) {
        pos++;
      }

      parts[i] = opFunc[operator](parts[prev] as string, parts[pos] as string);
      parts[prev] = null;
      parts[pos] = null;
    }
  }
  return parts.filter((x) => x !== null) as string[];
}

async function calc(evm: EVMcrispr, text: string): Promise<string> {
  let parts = text
    .replace('*', ' * ')
    .replace('/', ' / ')
    .replace('+', ' + ')
    .replace('-', ' - ')
    .split(' ');

  const resolve = (number: string): BigNumber => {
    if (number.startsWith('$')) {
      if (Array.isArray(evm.env(number))) {
        throw new Error(`${number} is not a number`);
      } else {
        return resolve(evm.env(number) as string);
      }
    } else {
      return BigNumber.from(evm.resolver.resolveNumber(number));
    }
  };

  parts = process('*', resolve, parts);
  parts = process('/', resolve, parts);
  parts = process('+', resolve, parts);
  parts = process('-', resolve, parts);

  if (parts.length !== 1) {
    throw new Error('Malformed calc experession');
  }

  return parts[0];
}

export default calc;
