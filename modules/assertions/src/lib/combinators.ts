import type { Address } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";

/**
 * ABI of the Combinators contract (v1.0) — the versionable periphery the
 * frozen assertions core points at for composed expressions. Enums travel
 * as uint8 in calldata.
 */
export const COMBINATORS_ABI = parseAbi([
  "function chainCall(address target, bytes[] calls) view",
  "function hashCall(address target, bytes[] calls) view returns (bytes32)",
  "function splitCall(address target, bytes[] calls, string delimiter, int256 index) view returns (string)",
  "function includesCall(address target, bytes[] calls, string part) view returns (bool)",
  "function charsetCall(address target, bytes[] calls, uint256 allowed) view returns (bool)",
  "function uintCall(address target, bytes[] calls, int256 wordIndex) view returns (uint256)",
  "function lengthCall(address target, bytes[] calls) view returns (uint256)",
  "function arrayLengthCall(address target, bytes[] calls) view returns (uint256)",
  "function navCall(address target, bytes[] calls, string abiType, int256[] path) view returns (uint256)",
  "function navDynCall(address target, bytes[] calls, string abiType, int256[] path) view",
  "function ethBalanceCall(address target, bytes[] calls) view returns (uint256)",
  "function calcUint(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (uint256)",
  "function calcInt(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (int256)",
  "function bitUint(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (uint256)",
  "function bitNotUint(address target, bytes data) view returns (uint256)",
  "function logicBool(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (bool)",
  "function notBool(address target, bytes data) view returns (bool)",
  "function boolToUint(address target, bytes data) view returns (uint256)",
  "function cmpUint(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (bool)",
  "function cmpInt(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (bool)",
  "function constantUint(uint256 x) pure returns (uint256)",
  "function constantInt(int256 x) pure returns (int256)",
  "function ethBalance(address account) view returns (uint256)",
  "function blockTimestamp() view returns (uint256)",
  "function blockNumber() view returns (uint256)",
  "function chainId() view returns (uint256)",
  "function codeHash(address account) view returns (bytes32)",
  "function codeHashCall(address target, bytes[] calls) view returns (bytes32)",
]);

export const ARITH_OP = {
  Add: 0,
  Sub: 1,
  Mul: 2,
  Div: 3,
  Mod: 4,
  Exp: 5,
  Min: 6,
  Max: 7,
  AbsDiff: 8,
} as const;
export type ArithOpName = keyof typeof ARITH_OP;

export const LOGIC_OP = { And: 0, Or: 1, Xor: 2 } as const;
export type LogicOpName = keyof typeof LOGIC_OP;

export const CMP_OP = { Eq: 0, Ne: 1, Gt: 2, Lt: 3, Ge: 4, Le: 5 } as const;
export type CmpOpName = keyof typeof CMP_OP;

export const BIT_OP = { And: 0, Or: 1, Xor: 2, Shl: 3, Shr: 4 } as const;
export type BitOpName = keyof typeof BIT_OP;

type CombinatorFn = (typeof COMBINATORS_ABI)[number]["name"];

/** Encode a call to a Combinators function. */
export function encodeCombinator(
  functionName: CombinatorFn,
  args: readonly unknown[],
): Hex {
  return encodeFunctionData({
    abi: COMBINATORS_ABI,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);
}

/** A `(target, calldata)` pair — the composition unit combinators consume. */
export interface CallPair {
  target: Address;
  data: Hex;
}
