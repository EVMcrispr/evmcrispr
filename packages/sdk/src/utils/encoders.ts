import type { Abi, AbiFunction, AbiParameter } from "viem";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  parseAbiItem,
  toHex,
} from "viem";

import { ErrorInvalid } from "../errors";
import type { Address, TransactionAction } from "../types";
import { Num } from "./Num";

export type Param = string | boolean | Num | Param[];

function toViemParam(p: Param): unknown {
  if (p instanceof Num) return p.toBigInt();
  if (Array.isArray(p)) return p.map(toViemParam);
  return p;
}

/**
 * Per-parameter validation + coercion shared by `encodeCalldata` and
 * `encodeConstructorParams`. Aggregates per-param errors into a single
 * `ErrorInvalid` so users see all of them at once.
 */
function coerceAndValidateParams(
  inputs: readonly AbiParameter[],
  params: Param[],
  contextLabel: string,
): unknown[] {
  const errors: string[] = [];
  const encodedParams: unknown[] = [];

  inputs.forEach((paramType, i) => {
    const { name, type } = paramType;
    try {
      let paramValue: Param = params[i];

      // TODO: Include support for tuple types, e.g. (uint256, uint256)
      if (
        (type.startsWith("uint") || type.startsWith("int")) &&
        !type.endsWith("[]") &&
        (typeof paramValue === "boolean" || typeof paramValue === "undefined")
      ) {
        throw new ErrorInvalid(`Invalid BigInt value`);
      }

      if (
        (type.startsWith("uint") || type.startsWith("int")) &&
        type.endsWith("[]") &&
        Array.isArray(paramValue) &&
        paramValue
          .flat()
          .some((val) => typeof val === "boolean" || typeof val === "undefined")
      ) {
        throw new ErrorInvalid(`Invalid BigInt array value`);
      }

      if (
        type.includes("byte") &&
        typeof paramValue === "string" &&
        !paramValue.startsWith("0x")
      ) {
        const _size = type.match(/^bytes(\d*)$/)?.[1];
        const size = _size ? Number(_size) : undefined;
        paramValue = toHex(paramValue, { size });
      }
      const resolved = toViemParam(paramValue);
      encodeAbiParameters([paramType], [resolved]);
      encodedParams.push(resolved);
    } catch (err) {
      const err_ = err as Error;
      errors.push(
        `-param ${name ?? i} of type ${type}: ${
          err_.message.split(" (")[0] ?? err_.message
        }. Got ${params[i] ?? "none"}`,
      );
    }
  });

  if (errors.length) {
    throw new ErrorInvalid(
      `error when encoding ${contextLabel}:\n${errors.join("\n")}`,
    );
  }

  return encodedParams;
}

/** Normalize a human-readable function signature to a parseable ABI form
 *  ("transfer(address,uint256)" → "function transfer(address,uint256)"). */
export const normalizeSignature = (signature: string): string =>
  signature.startsWith("function") ? signature : `function ${signature}`;

/**
 * ABI-encode a `signature + params` call into calldata, like std exec does.
 */
export const encodeSignatureCall = (
  signature: string,
  params: Param[],
): `0x${string}` => {
  let fnABI: AbiFunction;
  try {
    fnABI = parseAbiItem(normalizeSignature(signature)) as AbiFunction;
  } catch (_err) {
    throw new ErrorInvalid(`Wrong signature format: ${signature}.`);
  }
  return encodeCalldata(fnABI, params);
};

export const encodeAction = (
  target: Address,
  signature: string,
  params: Param[],
  opts?: {
    value?: bigint;
    from?: Address;
    abi?: Abi;
  },
): TransactionAction => {
  let fnABI: AbiFunction;

  try {
    if (opts?.abi) {
      fnABI = getAbiItem({ abi: opts.abi, name: signature }) as AbiFunction;
    } else {
      fnABI = parseAbiItem(normalizeSignature(signature)) as AbiFunction;
    }
  } catch (_err) {
    throw new ErrorInvalid(`Wrong signature format: ${signature}.`);
  }

  const action: TransactionAction = {
    to: target,
    data: encodeCalldata(fnABI, params),
  };
  if (opts?.value !== undefined) action.value = opts.value;
  if (opts?.from !== undefined) action.from = opts.from;
  return action;
};

export const encodeCalldata = (
  abiFn: AbiFunction,
  params: Param[],
): `0x${string}` => {
  const methodName = abiFn.name;
  const encodedParams = coerceAndValidateParams(
    abiFn.inputs,
    params,
    `${methodName} call`,
  );

  /**
   * Need to encode the function call as a whole to take into account previous parameter
   * encodings when generating the offset values of possible dynamic type parameters.
   * See https://docs.soliditylang.org/en/v0.8.16/abi-spec.html#use-of-dynamic-types
   * for more information on how dynamic types are encoded
   */
  return encodeFunctionData({
    abi: [abiFn],
    functionName: methodName,
    args: encodedParams,
  });
};

/**
 * ABI-encode constructor parameters (no function selector). Returns the
 * encoded bytes that should be appended to a contract's creation bytecode
 * to produce its full init code.
 *
 * @example
 * const encoded = encodeConstructorParams(
 *   "constructor(string,uint8)",
 *   ["MyToken", 18],
 * );
 * const initCode = concatHex([creationBytecode, encoded]);
 */
export const encodeConstructorParams = (
  signature: string,
  params: Param[],
): `0x${string}` => {
  const trimmed = signature.trim();
  const fullSignature = trimmed.startsWith("constructor")
    ? trimmed
    : `constructor${trimmed.startsWith("(") ? trimmed : `(${trimmed})`}`;

  let inputs: readonly AbiParameter[];
  try {
    const parsed = parseAbiItem(fullSignature) as {
      inputs: readonly AbiParameter[];
    };
    inputs = parsed.inputs;
  } catch (_err) {
    throw new ErrorInvalid(`Wrong constructor signature format: ${signature}.`);
  }

  if (inputs.length !== params.length) {
    throw new ErrorInvalid(
      `constructor expects ${inputs.length} argument(s), got ${params.length}`,
    );
  }

  const encodedParams = coerceAndValidateParams(
    inputs,
    params,
    "constructor params",
  );

  return encodeAbiParameters(inputs as AbiParameter[], encodedParams);
};
