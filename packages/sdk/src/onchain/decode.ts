/**
 * Decoding what `Assertions.resolve` raw-returns for a compiled operand,
 * and the one `eth_call` that produces it. This is how a value is
 * PREVIEWED (an editor showing "the current value" of a subject) and how
 * the parity harness compares the two faces: the same bytes, the same
 * decoder, the same answer.
 */
import type { Address, Hex, PublicClient } from "viem";
import { decodeAbiParameters, getAddress } from "viem";
import { Num } from "../utils/Num";
import { CORE_ADDRESS } from "./addresses";
import { encodeResolve } from "./core";
import type { Category, Operand } from "./types";

/**
 * A resolved value in a form the two faces can be compared in.
 *
 * Off-chain a value is a JS string / boolean / `Num` / array, on-chain it
 * is 32-byte words plus a category and an optional decimal scale. Neither
 * is a superset, so both are normalized into this instead of one being
 * coerced towards the other.
 */
export type ResolvedValue =
  | { t: "num"; v: Num }
  | { t: "bool"; v: boolean }
  | { t: "addr"; v: Address }
  | { t: "str"; v: string }
  | { t: "hex"; v: Hex }
  | { t: "list"; v: ResolvedValue[] };

/** The inverse of `categoryFromAbiType`: the canonical ABI type a
 *  category's resolved bytes decode as. */
export function abiTypeOfCategory(cat: Category): string {
  return ABI_TYPE[cat];
}

const ABI_TYPE: Record<Category, string> = {
  Uint: "uint256",
  Int: "int256",
  Address: "address",
  Bool: "bool",
  Bytes32: "bytes32",
  String: "string",
  Bytes: "bytes",
};

/**
 * Decode what `Assertions.resolve` raw-returned.
 *
 * `decodeAs` is needed whenever the category cannot say what the bytes
 * mean: in practice any array, because an on-chain array is a `Bytes`
 * payload of packed words and the operand carries no element type.
 */
export function decodeResolved(
  data: Hex,
  cat: Category,
  scale = 0,
  decodeAs?: string,
): ResolvedValue {
  if (decodeAs?.endsWith("[]")) {
    // A words payload: the resolved bytes are the ABI-encoded `bytes`
    // return of the Collections call, and INSIDE that envelope the words
    // are packed bare, with no length head and no offsets.
    const [payload] = decodeAbiParameters([{ type: "bytes" }], data) as [Hex];
    const elem = decodeAs.slice(0, -2);
    const words: ResolvedValue[] = [];
    for (let i = 2; i + 64 <= payload.length; i += 64) {
      words.push(
        decodeWord(`0x${payload.slice(i, i + 64)}` as Hex, elem, scale),
      );
    }
    return { t: "list", v: words };
  }

  if (cat === "String" || cat === "Bytes") {
    const [v] = decodeAbiParameters(
      [{ type: decodeAs ?? ABI_TYPE[cat] }],
      data,
    ) as [string];
    return cat === "String"
      ? { t: "str", v }
      : { t: "hex", v: v.toLowerCase() as Hex };
  }

  // Word categories: take the FIRST word rather than round-tripping
  // through decodeAbiParameters, which is strict about trailing data (a
  // `::` call with several outputs resolves to more than one word).
  if (data.length < 66) {
    throw new Error(
      `resolve returned ${(data.length - 2) / 2} bytes, expected at least a word`,
    );
  }
  return decodeWord(data.slice(0, 66) as Hex, decodeAs ?? ABI_TYPE[cat], scale);
}

/** Decode one 32-byte word as `abiType`, dividing a scaled integer back
 *  into the rational it stands for. */
export function decodeWord(
  word: Hex,
  abiType: string,
  scale: number,
): ResolvedValue {
  const raw = BigInt(word);
  if (abiType === "bool") return { t: "bool", v: raw !== 0n };
  if (abiType === "address") {
    return { t: "addr", v: getAddress(`0x${word.slice(26)}`) };
  }
  if (abiType.startsWith("bytes")) {
    return { t: "hex", v: word.toLowerCase() as Hex };
  }
  // Two's complement: an int word above the sign bit is negative. Done
  // here rather than by viem because this path never sees an ABI envelope.
  const v =
    abiType.startsWith("int") && raw >= 1n << 255n ? raw - (1n << 256n) : raw;
  // The word IS the real value times 10^scale, so the scale divides back
  // out exactly: Num is a rational, not a float.
  return { t: "num", v: Num(v, 10n ** BigInt(scale)) };
}

/**
 * The `eth_call` that resolves a live operand: `Assertions.resolve` on
 * the core with the operand's OUTER constraints dropped (`resolve`
 * validates constraints before returning, so a judged param would revert
 * instead of yielding its value; nested constraints are part of what the
 * expression means and stay). A constant folded at composition time
 * never reaches the chain, so it has no call.
 */
export function resolveCall(
  operand: Operand,
): { to: Address; data: Hex } | undefined {
  if (operand.kind === "const") return undefined;
  return {
    to: CORE_ADDRESS,
    data: encodeResolve({ ...operand.param, constraints: [] }),
  };
}

export interface ResolveOperandOpts {
  /** Where the core is installed, when not at its canonical address. */
  core?: Address;
  /** Sender to evaluate the call as. Anything reading ORIGIN or CALLER
   *  sees this; without it a call has no sender and `@tx.from!` reads
   *  the zero address. */
  from?: Address;
  /** ABI type of the resolved bytes, for when the category cannot say.
   *  Any array needs it. */
  decodeAs?: string;
}

/** A build-time constant as the value it already is. */
function resolvedConst(operand: Operand & { kind: "const" }): ResolvedValue {
  const { cat, value } = operand;
  if (cat === "Bool") return { t: "bool", v: value === true };
  if (cat === "Address") return { t: "addr", v: getAddress(String(value)) };
  if (cat === "String") return { t: "str", v: String(value) };
  if (cat === "Bytes" || cat === "Bytes32") {
    return { t: "hex", v: String(value).toLowerCase() as Hex };
  }
  return { t: "num", v: value instanceof Num ? value : Num(value as never) };
}

/**
 * Evaluate a compiled operand on-chain and decode the value: one
 * `eth_call` to {@link resolveCall}, then {@link decodeResolved}. A
 * constant is returned as is.
 */
export async function resolveOperand(
  client: PublicClient,
  operand: Operand,
  opts: ResolveOperandOpts = {},
): Promise<ResolvedValue> {
  if (operand.kind === "const") return resolvedConst(operand);
  const call = resolveCall(operand) as { to: Address; data: Hex };
  const { data } = await client.call({
    to: opts.core ?? call.to,
    data: call.data,
    ...(opts.from === undefined ? {} : { account: opts.from }),
  });
  return decodeResolved(
    (data ?? "0x") as Hex,
    operand.cat,
    operand.scale ?? 0,
    opts.decodeAs,
  );
}
