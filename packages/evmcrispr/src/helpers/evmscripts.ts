import { utils } from 'ethers';
export { encodeCallScript } from '@1hive/connect';

export function createExecutorId(id: number): string {
  return `0x${String(id).padStart(8, '0')}`;
}

export const EMPTY_CALLS_SCRIPT = createExecutorId(1);

/**
 * Encode ACT function call
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
