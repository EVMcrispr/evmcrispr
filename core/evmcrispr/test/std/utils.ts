import { utils } from 'ethers';

import type { AST, CommandExpressionNode } from '../../src/types';

export const findStdCommandNode = (
  ast: AST,
  commandName: string,
): CommandExpressionNode | undefined => {
  const commandNode = ast.body.find(
    (n) => (n as CommandExpressionNode).name === commandName,
  ) as CommandExpressionNode;

  return commandNode;
};

/**
 * Encode a function call
 * @param {string} signature Function signature
 * @param {any[]} params
 */
export function encodeActCall(signature: string, params: any[] = []): string {
  const sigBytes = utils.hexDataSlice(utils.id(signature), 0, 4);
  const types = signature.replace(')', '').split('(')[1];

  // No params, return signature directly
  if (types === '') {
    return sigBytes;
  }

  const paramBytes = new utils.AbiCoder().encode(types.split(','), params);

  return `${sigBytes}${paramBytes.slice(2)}`;
}
