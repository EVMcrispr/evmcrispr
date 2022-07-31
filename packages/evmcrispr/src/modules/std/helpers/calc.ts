import { BigNumber } from 'ethers';

import type { EVMcrispr } from '../../..';

function process(
  operator: '*' | '/' | '+' | '-',
  resolveNumber: (number: string | number) => BigNumber | number,
  parts: (string | null)[],
): string[] {
  const opFunc = {
    '*': (a: string, b: string) =>
      BigNumber.from(resolveNumber(a)).mul(resolveNumber(b)).toString(),
    '/': (a: string, b: string) =>
      BigNumber.from(resolveNumber(a)).div(resolveNumber(b)).toString(),
    '+': (a: string, b: string) =>
      BigNumber.from(resolveNumber(a)).add(resolveNumber(b)).toString(),
    '-': (a: string, b: string) =>
      BigNumber.from(resolveNumber(a)).sub(resolveNumber(b)).toString(),
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

  parts = process('*', evm.resolver.resolveNumber, parts);
  parts = process('/', evm.resolver.resolveNumber, parts);
  parts = process('+', evm.resolver.resolveNumber, parts);
  parts = process('-', evm.resolver.resolveNumber, parts);

  if (parts.length !== 1) {
    throw new Error('Malformed calc experession');
  }

  return parts[0];
}

export default calc;
