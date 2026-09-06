import type { AbiParameter } from "viem";
import { markSignedInteger } from "./checkedArithmetic";
import { Num } from "./Num";

/** Preserve ABI signed provenance even for positive values selected later. */
export function preserveAbiNumbers(
  type: AbiParameter,
  value: unknown,
): unknown {
  const array = type.type.match(/\[(\d*)\]$/);
  if (array && Array.isArray(value)) {
    const element = {
      ...type,
      type: type.type.slice(0, -array[0].length),
    } as AbiParameter;
    return value.map((item) => preserveAbiNumbers(element, item));
  }
  if (type.type === "tuple" && value !== null && typeof value === "object") {
    const fields = (type as { components: readonly AbiParameter[] }).components;
    if (Array.isArray(value))
      return fields.map((field, i) => preserveAbiNumbers(field, value[i]));
    return Object.fromEntries(
      fields.map((field, i) => {
        const key = field.name || String(i);
        return [
          key,
          preserveAbiNumbers(field, (value as Record<string, unknown>)[key]),
        ];
      }),
    );
  }
  if (/^int\d*$/.test(type.type)) return markSignedInteger(Num(value));
  return value;
}

export function preserveAbiReturnNumbers(
  outputs: readonly AbiParameter[],
  value: unknown,
): unknown {
  if (outputs.length === 1) return preserveAbiNumbers(outputs[0], value);
  if (Array.isArray(value))
    return outputs.map((output, i) => preserveAbiNumbers(output, value[i]));
  return value;
}
