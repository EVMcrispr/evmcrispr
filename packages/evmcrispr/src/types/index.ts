import type { BigNumberish } from 'ethers';

export * from './actions';
export * from './ast';
export * from './modules';
export * from './parsers';

// ---------------------- TYPES ----------------------

/**
 * A string that contains an Ethereum address.
 */
export type Address = string;

// ---------------------- INTERFACES ----------------------

export interface ForwardOptions {
  gasPrice?: BigNumberish;
  gasLimit?: BigNumberish;
}
