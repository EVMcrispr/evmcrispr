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
  "function mulDiv(uint256 a, uint256 b, uint256 denominator) pure returns (uint256)",
  "function mulDivUp(uint256 a, uint256 b, uint256 denominator) pure returns (uint256)",
  "function addMod(uint256 a, uint256 b, uint256 m) pure returns (uint256)",
  "function mulMod(uint256 a, uint256 b, uint256 m) pure returns (uint256)",
  "function sqrt(uint256 x) pure returns (uint256)",
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
  "function shr(int256 a, uint256 bits) pure returns (int256)",
  "function bitSet(uint256 mask, uint256 index) pure returns (bool)",
  // environment
  "function balance(address account) view returns (uint256)",
  "function codehash(address account) view returns (bytes32)",
  "function timestamp() view returns (uint256)",
  "function blockNumber() view returns (uint256)",
  "function chainId() view returns (uint256)",
  "function baseFee() view returns (uint256)",
  "function prevRandao() view returns (uint256)",
  "function coinbase() view returns (address)",
  "function gasLimit() view returns (uint256)",
  "function blobBaseFee() view returns (uint256)",
  "function blockHash(uint256 n) view returns (bytes32)",
  "function origin() view returns (address)",
  "function gasPrice() view returns (uint256)",
  "function blobHash(uint256 index) view returns (bytes32)",
  // raw access
  "function rawCall(address target, bytes data) view returns (bytes)",
  "function code(address account) view returns (bytes)",
  // hashing
  "function hashPairSorted(bytes32 a, bytes32 b) pure returns (bytes32)",
  // bytes
  "function concat(bytes[] parts) pure returns (bytes)",
  "function slice(bytes data, uint256 start, uint256 len) pure returns (bytes)",
  "function byteLen(bytes data) pure returns (uint256)",
  "function hash(bytes data) pure returns (bytes32)",
  // search
  "function indexOf(bytes s, bytes needle, int256 occurrence) pure returns (uint256)",
  // string extras (ASCII-only case mapping; other bytes pass verbatim)
  "function replace(bytes s, bytes needle, bytes repl) pure returns (bytes)",
  "function toLower(bytes s) pure returns (bytes)",
  "function toUpper(bytes s) pure returns (bytes)",
  // native character-class test (bit i of mask set = byte value i allowed)
  "function charset(bytes s, uint256 mask) pure returns (bool)",
  // parse
  "function parseUint(bytes s) pure returns (uint256)",
  "function toString(uint256 v) pure returns (string)",
  // runtime encoder (encode raw-returns with no bytes envelope)
  "function encode(string types, bytes[] values) pure",
  // bounded folds (FoldExit as uint8: Full = 0, Any = 1, All = 2)
  "function foldRange(uint256 n, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldBytes(bytes s, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
  "function foldWords(bytes s, address target, bytes template, uint256 accOffset, uint256 elemOffset, bytes32 init, uint8 exit) view returns (bytes32)",
  // array-shape ops over aligned-word bytes payloads
  "function mapWords(bytes s, address target, bytes template, uint256 elemOffset) view returns (bytes)",
  "function filterWords(bytes s, address target, bytes template, uint256 elemOffset) view returns (bytes)",
  "function iotaWords(uint256 n) pure returns (bytes)",
  "function wordIndexOf(bytes s, bytes32 w) pure returns (uint256)",
  "function reverseWords(bytes s) pure returns (bytes)",
  "function zipWords(bytes a, bytes b) pure returns (bytes)",
  "function unzipWords(bytes s, uint256 which) pure returns (bytes)",
  "function sortWords(bytes s) pure returns (bytes)",
  "function uniqueWords(bytes s) pure returns (bytes)",
  "function sumWords(bytes s) pure returns (uint256)",
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
  bitSet: sel("bitSet(uint256,uint256)"),
  foldBytes: sel(
    "foldBytes(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
  ),
  foldWords: sel(
    "foldWords(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
  ),
  foldRange: sel(
    "foldRange(uint256,address,bytes,uint256,uint256,bytes32,uint8)",
  ),
  mulDiv: sel("mulDiv(uint256,uint256,uint256)"),
  sqrt: sel("sqrt(uint256)"),
  parseUint: sel("parseUint(bytes)"),
  toString: sel("toString(uint256)"),
  blockHash: sel("blockHash(uint256)"),
  gasPrice: sel("gasPrice()"),
  blobHash: sel("blobHash(uint256)"),
  concat: sel("concat(bytes[])"),
  // the signed shift overload takes (int256, uint256), outside the
  // opSelector (int256, int256) convention — so it lives here
  shrInt: sel("shr(int256,uint256)"),
  // v1.0 additions
  rawCall: sel("rawCall(address,bytes)"),
  code: sel("code(address)"),
  hashPairSorted: sel("hashPairSorted(bytes32,bytes32)"),
  mapWords: sel("mapWords(bytes,address,bytes,uint256)"),
  filterWords: sel("filterWords(bytes,address,bytes,uint256)"),
  iotaWords: sel("iotaWords(uint256)"),
  wordIndexOf: sel("wordIndexOf(bytes,bytes32)"),
  reverseWords: sel("reverseWords(bytes)"),
  zipWords: sel("zipWords(bytes,bytes)"),
  unzipWords: sel("unzipWords(bytes,uint256)"),
  sortWords: sel("sortWords(bytes)"),
  uniqueWords: sel("uniqueWords(bytes)"),
  sumWords: sel("sumWords(bytes)"),
  replace: sel("replace(bytes,bytes,bytes)"),
  toLower: sel("toLower(bytes)"),
  toUpper: sel("toUpper(bytes)"),
  charset: sel("charset(bytes,uint256)"),
} as const;

type OperatorFn =
  | "balance"
  | "codehash"
  | "timestamp"
  | "blockNumber"
  | "chainId"
  | "baseFee"
  | "prevRandao"
  | "coinbase"
  | "gasLimit"
  | "blobBaseFee"
  | "blockHash"
  | "origin"
  | "gasPrice"
  | "blobHash";

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
