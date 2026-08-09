import type { Hex } from "viem";
import { encodeFunctionData, parseAbi, toFunctionSelector } from "viem";

/**
 * ABI of the Operators contract (v1.0) — the versionable plain-Solidity
 * periphery. ZERO ERC-8211: every function takes and returns plain ABI
 * types, so decoded calldata reads on explorers. Composition happens in
 * the core: its `read` primitive resolves operand expressions and splices
 * the resolved values into this contract's calldata. Signedness rides on
 * the int256 overloads; comparisons return bool; folds take the FoldExit
 * enum as uint8 (Full = 0, Any = 1, All = 2).
 */
export const OPERATORS_ABI = parseAbi([
  // arithmetic (checked; exp is unsigned-only)
  "function add(uint256 a, uint256 b) pure returns (uint256)",
  "function add(int256 a, int256 b) pure returns (int256)",
  "function sub(uint256 a, uint256 b) pure returns (uint256)",
  "function sub(int256 a, int256 b) pure returns (int256)",
  "function mul(uint256 a, uint256 b) pure returns (uint256)",
  "function mul(int256 a, int256 b) pure returns (int256)",
  "function div(uint256 a, uint256 b) pure returns (uint256)",
  "function div(int256 a, int256 b) pure returns (int256)",
  "function mod(uint256 a, uint256 b) pure returns (uint256)",
  "function mod(int256 a, int256 b) pure returns (int256)",
  "function exp(uint256 a, uint256 b) pure returns (uint256)",
  "function min(uint256 a, uint256 b) pure returns (uint256)",
  "function min(int256 a, int256 b) pure returns (int256)",
  "function max(uint256 a, uint256 b) pure returns (uint256)",
  "function max(int256 a, int256 b) pure returns (int256)",
  "function absDiff(uint256 a, uint256 b) pure returns (uint256)",
  "function absDiff(int256 a, int256 b) pure returns (uint256)",
  // comparisons (bool results; eq/ne are bit-level and cover all words)
  "function eq(uint256 a, uint256 b) pure returns (bool)",
  "function ne(uint256 a, uint256 b) pure returns (bool)",
  "function lt(uint256 a, uint256 b) pure returns (bool)",
  "function lt(int256 a, int256 b) pure returns (bool)",
  "function gt(uint256 a, uint256 b) pure returns (bool)",
  "function gt(int256 a, int256 b) pure returns (bool)",
  "function le(uint256 a, uint256 b) pure returns (bool)",
  "function le(int256 a, int256 b) pure returns (bool)",
  "function ge(uint256 a, uint256 b) pure returns (bool)",
  "function ge(int256 a, int256 b) pure returns (bool)",
  // bitwise
  "function bitAnd(uint256 a, uint256 b) pure returns (uint256)",
  "function bitOr(uint256 a, uint256 b) pure returns (uint256)",
  "function bitXor(uint256 a, uint256 b) pure returns (uint256)",
  "function shl(uint256 a, uint256 bits) pure returns (uint256)",
  "function shr(uint256 a, uint256 bits) pure returns (uint256)",
  "function bitSet(uint256 mask, uint256 index) pure returns (bool)",
  // environment
  "function balance(address account) view returns (uint256)",
  "function codehash(address account) view returns (bytes32)",
  "function timestamp() view returns (uint256)",
  "function blockNumber() view returns (uint256)",
  "function chainId() view returns (uint256)",
  // bytes
  "function concat(bytes[] parts) pure returns (bytes)",
  "function slice(bytes data, uint256 start, uint256 len) pure returns (bytes)",
  "function byteLen(bytes data) pure returns (uint256)",
  "function hash(bytes data) pure returns (bytes32)",
  // search
  "function indexOf(bytes s, bytes needle, int256 from) pure returns (uint256)",
  "function matchAt(bytes s, bytes needle, uint256 pos) pure returns (uint256)",
  // runtime encoder (raw assembly return, no bytes envelope)
  "function encode(string types, bytes[] values) pure",
  // bounded folds (FoldExit as uint8: Full = 0, Any = 1, All = 2)
  "function foldRange(uint256 n, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldBytes(bytes s, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldWords(bytes s, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
]);

/** Fold early-exit modes (Operators.FoldExit, ABI-encoded as uint8). */
export const FOLD_EXIT = { Full: 0, Any: 1, All: 2 } as const;

/** Binary word operators with an int256 overload — signedness is selected
 *  at encode time from the tracked operand categories; everything else
 *  falls back to the uint256 signature. */
export const SIGNED_OVERLOADS: ReadonlySet<string> = new Set([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "min",
  "max",
  "absDiff",
  "lt",
  "gt",
  "le",
  "ge",
]);

/** Selector of a binary word operator, picking the int256 overload when
 *  `signed` and the operator has one (eq/ne, exp and the bitwise ops are
 *  unsigned-only and fall back to the uint256 signature). */
export function opSelector(name: string, signed = false): Hex {
  const types =
    signed && SIGNED_OVERLOADS.has(name) ? "int256,int256" : "uint256,uint256";
  return toFunctionSelector(`function ${name}(${types})`);
}

const sel = (signature: string): Hex =>
  toFunctionSelector(`function ${signature}`);

/** Selectors of the non-word-pair Operators functions the compiler
 *  splices operands into through the core's `read`. */
export const OP_SELECTORS = {
  balance: sel("balance(address)"),
  codehash: sel("codehash(address)"),
  hash: sel("hash(bytes)"),
  byteLen: sel("byteLen(bytes)"),
  indexOf: sel("indexOf(bytes,bytes,int256)"),
  slice: sel("slice(bytes,uint256,uint256)"),
  matchAt: sel("matchAt(bytes,bytes,uint256)"),
  bitSet: sel("bitSet(uint256,uint256)"),
  foldBytes: sel(
    "foldBytes(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
  ),
} as const;

type OperatorFn =
  | "balance"
  | "codehash"
  | "timestamp"
  | "blockNumber"
  | "chainId";

/** Encode plain calldata for a non-overloaded Operators function whose
 *  arguments are all known at composition time — a STATIC_CALL fetcher
 *  points straight at the Operators address, no read wrapper needed. */
export function encodeOperator(
  functionName: OperatorFn,
  args: readonly unknown[] = [],
): Hex {
  return encodeFunctionData({
    abi: OPERATORS_ABI,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);
}
