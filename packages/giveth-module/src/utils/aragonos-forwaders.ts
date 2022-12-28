import { utils } from 'ethers';

const CALLSCRIPT_ID = '0x00000001';

/**
 * A call script.
 */
export interface CallScriptAction {
  /**
   * The action's target.
   */
  to: string;
  /**
   * The action's calldata.
   */
  data: string;
}

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

/**
 * Encode a call script
 *
 * Example:
 *
 * input:
 * [
 *  { to: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, data: 0x11111111 },
 *  { to: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, data: 0x2222222222 }
 * ]
 *
 * output:
 * 0x00000001
 *   aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000411111111
 *   bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb000000052222222222
 *
 *
 * @param {Array<CallScriptAction>} actions
 * @returns {string}
 */
export function encodeCallScript(actions: CallScriptAction[]): string {
  return actions.reduce((script: string, { to, data }) => {
    const address = utils.defaultAbiCoder.encode(['address'], [to]);
    const dataLength = utils.defaultAbiCoder.encode(
      ['uint256'],
      [(data.length - 2) / 2],
    );

    return script + address.slice(26) + dataLength.slice(58) + data.slice(2);
  }, CALLSCRIPT_ID);
}
