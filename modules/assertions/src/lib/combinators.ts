import type { Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import type { InputParam } from "./erc8211";

/**
 * ABI of the Combinators contract (v2.0) — the versionable periphery the
 * frozen assertions core points at for composed expressions. Every operand
 * is an ERC-8211 `InputParam`, nesting recursively through STATIC_CALL
 * fetchers pointed back at the combinators address. Enums travel as uint8.
 */
export const COMBINATORS_ABI = parseAbi([
  "struct Constraint { uint8 constraintType; bytes referenceData; }",
  "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
  "function resolve(InputParam param) view",
  "function pick(InputParam param, int256 wordIndex) view returns (bytes32)",
  "function nav(InputParam a, string retTypes, int256[] path) view",
  "function chain(InputParam start, bytes[] calls) view",
  "function invoke(InputParam target, bytes4 selector, InputParam[] args) view",
  "function calc(uint8 op, InputParam a, InputParam b) view returns (uint256)",
  "function unary(uint8 op, InputParam a) view returns (uint256)",
  "function data(uint8 op, InputParam a, bytes arg, int256 index) view",
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
 *  entry of a nav path it selects the decoded LENGTH of the dynamic value
 *  the preceding steps navigate to. */
export const LEN_STEP = -(1n << 255n);

type CombinatorFn =
  | "resolve"
  | "pick"
  | "nav"
  | "chain"
  | "invoke"
  | "calc"
  | "unary"
  | "data"
  | "env";

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

/** Encode `resolve(param)` — raw passthrough of a resolved value. */
export function encodeResolve(param: InputParam): Hex {
  return encodeCombinator("resolve", [param]);
}

/** Encode `pick(param, wordIndex)` — a raw 32-byte word of the resolved
 *  value (signed index, negative = from the end). */
export function encodePick(param: InputParam, wordIndex: bigint): Hex {
  return encodeCombinator("pick", [param, wordIndex]);
}

/** Encode `nav(a, retTypes, path)` — typed navigation of the resolved
 *  value: one index per nesting level, negative = from the end, LEN_STEP
 *  as the final entry selects the navigated value's decoded length. */
export function encodeNav(
  a: InputParam,
  retTypes: string,
  path: readonly bigint[],
): Hex {
  return encodeCombinator("nav", [a, retTypes, [...path]]);
}

/** Encode `chain(start, calls)` — staticcalls across runtime-resolved
 *  addresses: `start` resolves to the first hop's target, each hop's first
 *  return word is the next target, the last hop's returndata passes through. */
export function encodeChain(start: InputParam, calls: readonly Hex[]): Hex {
  return encodeCombinator("chain", [start, [...calls]]);
}

/** Encode `invoke(target, selector, args)` — a staticcall constructed at
 *  judge time: calldata is the selector followed by each arg's FULL
 *  resolved bytes in order (ERC-8211 CALL_DATA routing). Args are calldata
 *  SEGMENTS, not necessarily one per Solidity argument: a RAW_BYTES segment
 *  carries any literal span, a STATIC_CALL segment computes a span
 *  on-chain. In error reporting the target is operand 0, args[i] operand
 *  i + 1. */
export function encodeInvoke(
  target: InputParam,
  selector: Hex,
  args: readonly InputParam[],
): Hex {
  return encodeCombinator("invoke", [target, selector, [...args]]);
}

/** Encode `calc(op, a, b)` over two operands. */
export function encodeCalc(op: CalcOpName, a: InputParam, b: InputParam): Hex {
  return encodeCombinator("calc", [CALC_OP[op], a, b]);
}

/** Encode `unary(op, a)`. */
export function encodeUnary(op: UnaryOpName, a: InputParam): Hex {
  return encodeCombinator("unary", [UNARY_OP[op], a]);
}

/** Encode `data(op, a, arg, index)`. */
export function encodeData(
  op: DataOpName,
  a: InputParam,
  arg: Hex = "0x",
  index = 0n,
): Hex {
  return encodeCombinator("data", [DATA_OP[op], a, arg, index]);
}

/** Encode `env(op, arg)`. */
export function encodeEnv(op: EnvOpName, arg = 0n): Hex {
  return encodeCombinator("env", [ENV_OP[op], arg]);
}
