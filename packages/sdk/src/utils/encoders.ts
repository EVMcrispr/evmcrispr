import type { Abi, AbiFunction } from "viem";
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
      const fullSignature = signature.startsWith("function")
        ? signature
        : `function ${signature}`;
      fnABI = parseAbiItem(fullSignature) as AbiFunction;
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
  const errors: string[] = [];
  const encodedParams: Param[] = [];

  // Encode parameters individually to generate better error messages
  abiFn.inputs.forEach((paramType, i) => {
    const { name, type } = paramType;
    try {
      let paramValue: Param = params[i];

      // TODO: Include support for tuple types, e.g. (uint256, uint256)
      if (
        (paramType.type.startsWith("uint") ||
          paramType.type.startsWith("int")) &&
        !paramType.type.endsWith("[]") &&
        (typeof paramValue === "boolean" || typeof paramValue === "undefined")
      ) {
        throw new ErrorInvalid(`Invalid BigInt value`);
      }

      if (
        (paramType.type.startsWith("uint") ||
          paramType.type.startsWith("int")) &&
        paramType.type.endsWith("[]") &&
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
      encodedParams.push(resolved as Param);
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
      `error when encoding ${methodName} call:\n${errors.join("\n")}`,
    );
  }

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
