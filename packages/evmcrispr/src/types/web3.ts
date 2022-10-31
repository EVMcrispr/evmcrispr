import type { utils } from 'ethers';

/**
 * A string that contains an Ethereum address.
 */
export type Address = string;

export type Abi =
  | (utils.EventFragment | utils.FunctionFragment)[]
  | utils.Interface;
