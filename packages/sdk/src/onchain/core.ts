import type { Address, Hex } from "viem";
import { encodeFunctionData, parseAbi } from "viem";
import type { InputParam } from "./erc8211";
import { rawParam, toWord } from "./erc8211";

/**
 * ABI of the ERC-8211-speaking primitives of the Assertions core (v2.0).
 * The frozen core owns everything that holds unresolved `InputParam`
 * operands: selection (`resolve`, `pick`, `nav`), call construction
 * (`chain`, `read`) and resolution control (`cond`, `orElse`, `isValid`,
 * `revertData`). Operands nest recursively through STATIC_CALL fetchers
 * pointed back at the core address. Enums travel as uint8.
 */
export const CORE_ABI = parseAbi([
  "struct Constraint { uint8 constraintType; bytes referenceData; }",
  "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
  "function resolve(InputParam param) view",
  "function pick(InputParam param, int256 wordIndex) view returns (bytes32)",
  "function nav(InputParam a, string retTypes, int256[] path) view",
  "function chain(InputParam start, bytes[] calls) view",
  "function read(InputParam target, bytes4 selector, InputParam[] args) view",
  "function cond(InputParam c, InputParam then_, InputParam else_) view",
  "function orElse(InputParam a, InputParam b) view",
  "function isValid(InputParam a) view returns (uint256)",
  "function revertData(InputParam a, bytes4 expectedSelector) view",
]);

/** Sentinel path entry (Assertions.LEN = type(int256).min): as the last
 *  entry of a nav path it selects the decoded LENGTH of the dynamic value
 *  the preceding steps navigate to. */
export const LEN_STEP = -(1n << 255n);

type CoreFn =
  | "resolve"
  | "pick"
  | "nav"
  | "chain"
  | "read"
  | "cond"
  | "orElse"
  | "isValid"
  | "revertData";

/** Encode a call to a core ERC-8211 primitive. */
export function encodeCore(
  functionName: CoreFn,
  args: readonly unknown[],
): Hex {
  return encodeFunctionData({
    abi: CORE_ABI,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);
}

/** Encode `resolve(param)` — raw passthrough of a resolved value. */
export function encodeResolve(param: InputParam): Hex {
  return encodeCore("resolve", [param]);
}

/** Encode `pick(param, wordIndex)` — a raw 32-byte word of the resolved
 *  value (signed index, negative = from the end). */
export function encodePick(param: InputParam, wordIndex: bigint): Hex {
  return encodeCore("pick", [param, wordIndex]);
}

/** Encode `nav(a, retTypes, path)` — typed navigation of the resolved
 *  value: one index per nesting level, negative = from the end, LEN_STEP
 *  as the final entry selects the navigated value's decoded length. */
export function encodeNav(
  a: InputParam,
  retTypes: string,
  path: readonly bigint[],
): Hex {
  return encodeCore("nav", [a, retTypes, [...path]]);
}

/** Encode `chain(start, calls)` — staticcalls across runtime-resolved
 *  addresses: `start` resolves to the first hop's target, each hop's first
 *  return word is the next target, the last hop's returndata passes through. */
export function encodeChain(start: InputParam, calls: readonly Hex[]): Hex {
  return encodeCore("chain", [start, [...calls]]);
}

/** Encode `read(target, selector, args)` — a staticcall constructed at
 *  judge time: calldata is the selector followed by each arg's FULL
 *  resolved bytes in order (ERC-8211 CALL_DATA routing). Args are calldata
 *  SEGMENTS, not necessarily one per Solidity argument: a RAW_BYTES segment
 *  carries any literal span, a STATIC_CALL segment computes a span
 *  on-chain. In error reporting the target is operand 0, args[i] operand
 *  i + 1. */
export function encodeRead(
  target: InputParam,
  selector: Hex,
  args: readonly InputParam[],
): Hex {
  return encodeCore("read", [target, selector, [...args]]);
}

/** Encode `read(operators, selector, args)` — an Operators call composed
 *  from unresolved operands: the core resolves each operand and splices
 *  the values after the selector, then staticcalls the Operators contract
 *  and raw-returns the result. */
export function encodeOpRead(
  operators: Address,
  selector: Hex,
  args: readonly InputParam[],
): Hex {
  return encodeRead(rawParam(toWord(BigInt(operators))), selector, args);
}

/** Encode `cond(c, then, else)` — the lazy conditional: only the winning
 *  branch is resolved and its bytes pass through raw. */
export function encodeCond(
  c: InputParam,
  then_: InputParam,
  else_: InputParam,
): Hex {
  return encodeCore("cond", [c, then_, else_]);
}

/** Encode `orElse(a, b)` — resolve `a`; any revert selects `b`. */
export function encodeOrElse(a: InputParam, b: InputParam): Hex {
  return encodeCore("orElse", [a, b]);
}

/** Encode `isValid(a)` — 1 when `a` resolves AND passes its constraints,
 *  else 0. */
export function encodeIsValid(a: InputParam): Hex {
  return encodeCore("isValid", [a]);
}

/** Encode `revertData(a, expectedSelector)` — the revert data of a call
 *  that MUST fail. With a non-zero selector the first four bytes must
 *  match and are stripped, leaving the error's arguments word-aligned for
 *  `pick`/`nav`; a zero selector accepts any revert and passes the data
 *  through whole. A success (`DidNotRevert`) or a selector mismatch
 *  (`UnexpectedRevertData`) reverts instead of resolving. */
export function encodeRevertData(a: InputParam, expectedSelector: Hex): Hex {
  return encodeCore("revertData", [a, expectedSelector]);
}
