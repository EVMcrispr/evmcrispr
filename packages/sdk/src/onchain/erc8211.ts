import type { Hex } from "viem";
import { encodeFunctionData, encodePacked, numberToHex, parseAbi } from "viem";
import type { Address } from "../types";

/**
 * TypeScript mirror of the ERC-8211 (Smart Batching) wire format the v2
 * Assertions core judges: input parameters (`InputParam`) resolved by
 * fetchers and validated against inline constraints, batched into
 * `ComposableExecution` entries. Byte-for-byte the standard encoding —
 * batches built here decode in any ERC-8211 implementation.
 */

// ---------------------------------------------------------------------------
//  Wire-format enums (ABI-encoded as uint8)
// ---------------------------------------------------------------------------

/** Where a resolved input parameter is routed (InputParamType). */
export const PARAM_TYPE = { Target: 0, Value: 1, CallData: 2 } as const;

/** How an input parameter's value is obtained (InputParamFetcherType). */
export const FETCHER_TYPE = { RawBytes: 0, StaticCall: 1, Balance: 2 } as const;

/** Inline predicate kinds (ConstraintType). Comparisons are unsigned over
 *  the resolved value's first 32-byte word. */
export const CONSTRAINT_TYPE = { Eq: 0, Gte: 1, Lte: 2, In: 3 } as const;
export type ConstraintTypeName = keyof typeof CONSTRAINT_TYPE;

// ---------------------------------------------------------------------------
//  Wire-format structs (as viem-friendly objects)
// ---------------------------------------------------------------------------

/** An inline predicate attached to an input parameter. */
export interface Constraint {
  constraintType: number;
  referenceData: Hex;
}

/** A single runtime-resolved parameter: fetcher + inline constraints. */
export interface InputParam {
  paramType: number;
  fetcherType: number;
  paramData: Hex;
  constraints: Constraint[];
}

/** One smart-batch entry. The judge is view-only, so `outputParams` is
 *  always empty here. */
export interface ComposableExecution {
  functionSig: Hex;
  inputParams: InputParam[];
  outputParams: [];
}

// ---------------------------------------------------------------------------
//  ABI
// ---------------------------------------------------------------------------

/** ABI of the Assertions core v2 (the batch judge + the shorthand). */
export const ASSERTIONS_ABI = parseAbi([
  "struct Constraint { uint8 constraintType; bytes referenceData; }",
  "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
  "struct OutputParam { uint8 fetcherType; bytes paramData; }",
  "struct ComposableExecution { bytes4 functionSig; InputParam[] inputParams; OutputParam[] outputParams; }",
  "function assertParam(InputParam param) view",
  "function assertParam(InputParam param, string message) view",
  "function assertComposable(ComposableExecution[] executions) view",
  "function assertComposable(ComposableExecution[] executions, string message) view",
]);

// ---------------------------------------------------------------------------
//  Constructors
// ---------------------------------------------------------------------------

const WORD_MASK = (1n << 256n) - 1n;

/** A value as its raw 32-byte word (negatives as two's complement). */
export function toWord(value: bigint): Hex {
  return numberToHex(value & WORD_MASK, { size: 32 });
}

/** A CALL_DATA RAW_BYTES parameter carrying literal bytes. */
export function rawParam(
  data: Hex,
  constraints: Constraint[] = [],
): InputParam {
  return {
    paramType: PARAM_TYPE.CallData,
    fetcherType: FETCHER_TYPE.RawBytes,
    paramData: data,
    constraints,
  };
}

/** A RAW_BYTES parameter carrying a literal 32-byte word. */
export function wordParam(
  value: bigint,
  constraints: Constraint[] = [],
): InputParam {
  return rawParam(toWord(value), constraints);
}

/** A CALL_DATA STATIC_CALL parameter: the raw returndata of
 *  `staticcall(target, data)` is the value. */
export function staticCallParam(
  target: Address,
  data: Hex,
  constraints: Constraint[] = [],
): InputParam {
  return {
    paramType: PARAM_TYPE.CallData,
    fetcherType: FETCHER_TYPE.StaticCall,
    paramData: encodeStaticCallData(target, data),
    constraints,
  };
}

/** The STATIC_CALL fetcher's paramData: abi.encode(target, data). */
export function encodeStaticCallData(target: Address, data: Hex): Hex {
  // abi.encode(address, bytes), hand-rolled — byte-identical to viem's
  // encoder, kept explicit so the layout is auditable in one place.
  const len = (data.length - 2) / 2;
  const padded = (data + "00".repeat((32 - (len % 32)) % 32)) as Hex;
  return `0x${toWord(BigInt(target)).slice(2)}${toWord(64n).slice(2)}${toWord(
    BigInt(len),
  ).slice(2)}${padded.slice(2)}`;
}

/** A CALL_DATA BALANCE parameter: native balance when `token` is the zero
 *  address, IERC20(token).balanceOf(account) otherwise. */
export function balanceParam(
  token: Address,
  account: Address,
  constraints: Constraint[] = [],
): InputParam {
  return {
    paramType: PARAM_TYPE.CallData,
    fetcherType: FETCHER_TYPE.Balance,
    paramData: encodePacked(["address", "address"], [token, account]),
    constraints,
  };
}

/** A TARGET RAW_BYTES parameter routing a literal address. */
export function targetParam(target: Address): InputParam {
  return {
    paramType: PARAM_TYPE.Target,
    fetcherType: FETCHER_TYPE.RawBytes,
    paramData: toWord(BigInt(target)),
    constraints: [],
  };
}

/** An EQ / GTE / LTE constraint over a 32-byte word. */
export function constraint(
  type: ConstraintTypeName,
  word: bigint | Hex,
): Constraint {
  return {
    constraintType: CONSTRAINT_TYPE[type],
    referenceData: typeof word === "bigint" ? toWord(word) : word,
  };
}

/** An inclusive IN [lower, upper] range constraint (unsigned bounds). */
export function inConstraint(lower: bigint, upper: bigint): Constraint {
  return {
    constraintType: CONSTRAINT_TYPE.In,
    referenceData: `0x${toWord(lower).slice(2)}${toWord(upper).slice(2)}`,
  };
}

// ---------------------------------------------------------------------------
//  Calldata builders (emitted actions)
// ---------------------------------------------------------------------------

function abiItem(name: string, argCount: number) {
  const item = ASSERTIONS_ABI.find(
    (f) =>
      f.type === "function" && f.name === name && f.inputs.length === argCount,
  );
  if (!item) throw new Error(`missing ABI item ${name}/${argCount}`);
  return item;
}

/** Calldata for `assertParam(param[, message])` — the message overload is
 *  used only when a message is provided. */
export function encodeAssertParam(param: InputParam, message = ""): Hex {
  return message === ""
    ? encodeFunctionData({
        abi: [abiItem("assertParam", 1)],
        functionName: "assertParam",
        args: [param],
      } as unknown as Parameters<typeof encodeFunctionData>[0])
    : encodeFunctionData({
        abi: [abiItem("assertParam", 2)],
        functionName: "assertParam",
        args: [param, message],
      } as unknown as Parameters<typeof encodeFunctionData>[0]);
}
