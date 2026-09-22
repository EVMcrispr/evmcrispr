import {
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  type Hex,
  parseAbiItem,
  toFunctionSelector,
} from "viem";
import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type { TransactionAction } from "../types";
import { normalizeSignature } from "../utils/encoders";
import {
  canonicalBytesParam,
  concatenateResolved,
  encodeArgumentsParam,
} from "./collections";
import { formatParamType } from "./compile";
import { rawParam } from "./erc8211";
import { wordPartParam } from "./recipes";
import { getSmartCompileContext, runtimeValue, smartValueParam } from "./smart";
import {
  hasRuntimeValue,
  isRuntimeValue,
  type PlannedCall,
  type RuntimeValue,
} from "./smart-types";

const calls = new WeakMap<RuntimeValue, PlannedCall>();
function context(module: Module | undefined) {
  const ctx = module && getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime encoding requires a smart batch");
  return ctx;
}
/** Like viem's encoder, but keeps live arguments as a canonical bytes value. */
export function smartFunctionData(
  module: Module | undefined,
  request: { abi: Abi; functionName: string; args?: readonly unknown[] },
): Hex | RuntimeValue {
  if (
    !hasRuntimeValue(request.args) &&
    (!module || !getSmartCompileContext(module))
  )
    return encodeFunctionData(request as any);
  const ctx = context(module);
  const fn = getAbiItem({
    abi: request.abi,
    name: request.functionName,
  }) as AbiFunction;
  const args = [...(request.args ?? [])];
  const params = fn.inputs.map((type, i) =>
    smartValueParam(ctx, type, args[i]),
  );
  const body = encodeArgumentsParam(
    ctx,
    `(${fn.inputs.map(formatParamType).join(",")})`,
    params,
  );
  const param = concatenateResolved(ctx, [
    rawParam(toFunctionSelector(fn)),
    body,
  ]);
  const value = runtimeValue(
    canonicalBytesParam(ctx, param),
    { type: "bytes" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
  );
  calls.set(value, {
    target: "0x0000000000000000000000000000000000000000",
    abi: fn,
    args,
  });
  return value;
}
/** ABI payload bytes for nested router commands, resolved in the execution frame. */
export function smartAbiParameters(
  module: Module | undefined,
  types: readonly AbiParameter[],
  values: readonly unknown[],
): Hex | RuntimeValue {
  if (!hasRuntimeValue(values)) return encodeAbiParameters(types, values);
  const ctx = context(module);
  const params = types.map((type, i) => smartValueParam(ctx, type, values[i]));
  const body = encodeArgumentsParam(
    ctx,
    `(${types.map(formatParamType).join(",")})`,
    params,
  );
  return runtimeValue(
    canonicalBytesParam(ctx, body),
    { type: "bytes" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
  );
}
/** Preserve the typed primary call when a protocol builder constructs calldata first. */
export function smartDataAction(
  target: Address,
  data: Hex | RuntimeValue,
  value?: bigint | RuntimeValue,
): TransactionAction {
  if (isRuntimeValue(data)) {
    const call = calls.get(data);
    if (!call)
      throw new ErrorException(
        "dynamic raw calldata requires a declared function ABI; use exec",
      );
    return { plannedCall: { ...call, target, value } };
  }
  if (isRuntimeValue(value))
    throw new ErrorException(
      "dynamic call value requires typed calldata; use exec",
    );
  return { to: target, data, ...(value === undefined ? {} : { value }) };
}

/** Raw calldata keeps its selector fixed; ERC-8211 cannot send dynamic short data. */
export function smartRawAction(
  target: Address | RuntimeValue,
  data: Hex,
  value: bigint | RuntimeValue = 0n,
): TransactionAction {
  if (!isRuntimeValue(target) && !isRuntimeValue(value))
    return { to: target, data, value };
  if (data.length < 10)
    throw new ErrorException(
      "dynamic empty/short-calldata calls cannot be represented by the composability executor",
    );
  return {
    plannedCall: {
      target,
      value,
      rawData: data,
      abi: {
        type: "function",
        name: "raw",
        inputs: [],
        outputs: [],
        stateMutability: "payable",
      },
      args: [],
    },
  };
}

/** ENS multicoin and packed protocol fields use the 20-byte address payload. */
export function smartAddressBytes(
  module: Module,
  value: Address | RuntimeValue,
): Hex | RuntimeValue {
  if (!isRuntimeValue(value)) return value;
  const ctx = context(module);
  return runtimeValue(
    wordPartParam(
      ctx,
      smartValueParam(ctx, { type: "address" }, value),
      12n,
      20n,
    ),
    { type: "bytes" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
  );
}

/** Typed signature variant used by wrappers such as AccessManager. */
export function smartSignatureCall(
  module: Module,
  signature: string,
  values: unknown[],
): Hex | RuntimeValue {
  const fn = parseAbiItem(normalizeSignature(signature)) as AbiFunction;
  return smartFunctionData(module, {
    abi: [fn],
    functionName: fn.name,
    args: values,
  });
}
