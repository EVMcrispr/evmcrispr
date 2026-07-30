/**
 * BN254 scalar-field primitives.
 *
 * All circom helpers operate on elements of the scalar field of BN254 (aka
 * alt_bn128), the field circom and snarkjs target by default. Inputs are
 * accepted as numbers, decimal strings or 0x-hex values and reduced into
 * the field with the circom convention: values >= p wrap around and
 * negative values map to `p - |x|`. `@circom:field` exposes the reduction
 * explicitly; every other helper applies the same leniency to its inputs.
 */
import { ErrorException, Num } from "@evmcrispr/sdk";
import { type Hex, keccak256 } from "viem";

/** Order of the BN254 scalar field (circom's default prime). */
export const BN254_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Reduce an integer into the field, wrapping negatives (circom convention). */
export function toField(x: bigint): bigint {
  return ((x % BN254_PRIME) + BN254_PRIME) % BN254_PRIME;
}

/** Parse a helper argument (Num, decimal string or hex value) into a field element. */
export function parseFieldInput(value: unknown, argName: string): bigint {
  if (typeof value === "boolean") {
    return value ? 1n : 0n;
  }
  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      // BigInt("") is 0n — reject blanks explicitly.
      if (trimmed === "") throw new Error("empty string");
      return toField(BigInt(trimmed));
    }
    const num = Num(value);
    if (!num.isInteger()) {
      throw new Error("not an integer");
    }
    return toField(num.toBigInt());
  } catch {
    throw new ErrorException(
      `<${argName}> must be a field element (number, decimal string or hex value), got ${value}`,
    );
  }
}

export function parseFieldArray(value: unknown, argName: string): bigint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ErrorException(`<${argName}> must be a non-empty array`);
  }
  return value.map((v) => parseFieldInput(v, argName));
}

/** keccak256 of the given bytes, reduced into the field. */
export function keccakToField(data: Hex): bigint {
  return toField(BigInt(keccak256(data)));
}

/**
 * Uniform random field element via rejection sampling (mask to 254 bits,
 * redraw on >= p — no modulo bias).
 */
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  for (;;) {
    crypto.getRandomValues(bytes);
    bytes[0] &= 0x3f;
    let value = 0n;
    for (const byte of bytes) {
      value = (value << 8n) | BigInt(byte);
    }
    if (value < BN254_PRIME) return value;
  }
}

/** LSB-first bit decomposition, e.g. a merkle path index → circuit indices. */
export function toBits(value: bigint, count: number): bigint[] {
  if (!Number.isInteger(count) || count < 1 || count > 254) {
    throw new ErrorException(`<count> must be between 1 and 254, got ${count}`);
  }
  if (value < 0n || value >> BigInt(count) !== 0n) {
    throw new ErrorException(`<value> does not fit in ${count} bits: ${value}`);
  }
  return Array.from({ length: count }, (_, i) => (value >> BigInt(i)) & 1n);
}
