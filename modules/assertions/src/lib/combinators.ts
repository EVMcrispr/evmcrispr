import type { Address } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";

/**
 * ABI of the Combinators contract (v1.0) — the versionable periphery the
 * frozen assertions core points at for composed expressions. Five unified
 * functions: `read` (navigated call chains), `calc` (binary word ops),
 * `unary` (unary word ops), `data` (returndata ops) and `env` (constants
 * and environment values). Enums travel as uint8 in calldata.
 */
export const COMBINATORS_ABI = parseAbi([
  "function read(address target, bytes[] calls, string[] retTypes, int256[][] paths) view",
  "function calc(uint8 op, address target1, bytes data1, address target2, bytes data2) view returns (uint256)",
  "function unary(uint8 op, address target, bytes callData) view returns (uint256)",
  "function data(uint8 op, address target, bytes[] calls, bytes arg, int256 index) view",
  "function env(uint8 op, uint256 arg) view returns (uint256)",
]);

/** Binary word opcodes (Combinators.CalcOp). Unsigned ops and their signed
 *  variants sit side by side, EVM-style; comparisons return 0/1 words;
 *  AbsDiff/SAbsDiff return the |a-b| magnitude as uint256 and are total. */
export const CALC_OP = {
  Add: 0,
  SAdd: 1,
  Sub: 2,
  SSub: 3,
  Mul: 4,
  SMul: 5,
  Div: 6,
  SDiv: 7,
  Mod: 8,
  SMod: 9,
  Exp: 10,
  Min: 11,
  SMin: 12,
  Max: 13,
  SMax: 14,
  AbsDiff: 15,
  SAbsDiff: 16,
  And: 17,
  Or: 18,
  Xor: 19,
  Shl: 20,
  Shr: 21,
  Eq: 22,
  Ne: 23,
  Lt: 24,
  SLt: 25,
  Gt: 26,
  SGt: 27,
  Le: 28,
  SLe: 29,
  Ge: 30,
  SGe: 31,
} as const;
export type CalcOpName = keyof typeof CALC_OP;

/** Unary word opcodes (Combinators.UnaryOp). */
export const UNARY_OP = { Not: 0, IsZero: 1, Balance: 2, CodeHash: 3 } as const;
export type UnaryOpName = keyof typeof UNARY_OP;

/** Returndata opcodes (Combinators.DataOp). */
export const DATA_OP = {
  Split: 0,
  Includes: 1,
  Charset: 2,
  Hash: 3,
  ByteLen: 4,
} as const;
export type DataOpName = keyof typeof DATA_OP;

/** Value-getter opcodes (Combinators.EnvOp). */
export const ENV_OP = {
  Constant: 0,
  Timestamp: 1,
  BlockNumber: 2,
  ChainId: 3,
  Balance: 4,
  CodeHash: 5,
} as const;
export type EnvOpName = keyof typeof ENV_OP;

/** Sentinel path entry (Combinators.LEN = type(int256).min): as the last
 *  entry of a typed read path it selects the decoded LENGTH of the dynamic
 *  value the preceding steps navigate to. */
export const LEN_STEP = -(1n << 255n);

const WORD_MASK = (1n << 256n) - 1n;

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

/** Encode `read` from parallel per-hop arrays. */
export function encodeRead(
  target: Address,
  calls: readonly Hex[],
  retTypes: readonly string[],
  paths: readonly (readonly bigint[])[],
): Hex {
  return encodeCombinator("read", [target, calls, retTypes, paths]);
}

/** Encode `calc(op, l, r)` over two operand pairs. */
export function encodeCalc(op: CalcOpName, l: CallPair, r: CallPair): Hex {
  return encodeCombinator("calc", [
    CALC_OP[op],
    l.target,
    l.data,
    r.target,
    r.data,
  ]);
}

/** Encode `unary(op, operand)`. */
export function encodeUnary(op: UnaryOpName, operand: CallPair): Hex {
  return encodeCombinator("unary", [
    UNARY_OP[op],
    operand.target,
    operand.data,
  ]);
}

/** Encode `data(op, target, calls, arg, index)`. */
export function encodeData(
  op: DataOpName,
  target: Address,
  calls: readonly Hex[],
  arg: Hex = "0x",
  index = 0n,
): Hex {
  return encodeCombinator("data", [DATA_OP[op], target, calls, arg, index]);
}

/** Encode `env(op, arg)`. */
export function encodeEnv(op: EnvOpName, arg = 0n): Hex {
  return encodeCombinator("env", [ENV_OP[op], arg]);
}

/** Encode an `env(Constant)` operand; negative values travel as their
 *  two's-complement word. */
export function encodeConstant(value: bigint): Hex {
  return encodeEnv("Constant", value & WORD_MASK);
}
