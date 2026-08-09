import { defineHelper, HelperFunctionError, Num } from "@evmcrispr/sdk";
import { encodePacked } from "viem";
import type Std from "..";

function toPackedValue(type: string, v: unknown): unknown {
  if (v instanceof Num) return v.toBigInt();
  if (type.startsWith("uint") || type.startsWith("int"))
    return BigInt(String(v));
  if (type === "bool") return v === "true" || v === true;
  return v;
}

export default defineHelper<Std>({
  name: "abi.encodePacked",
  description:
    "ABI non-standard packed encoding, matching Solidity's abi.encodePacked.",
  returnType: "bytes",
  args: [
    {
      name: "types",
      type: "string",
      description: 'Comma-separated Solidity types (e.g. "address,uint256")',
    },
    {
      name: "values",
      type: "any",
      description: "Values to encode, one per type",
      rest: true,
    },
  ],
  async run(_, { types, values }, { node }) {
    const typeList = types
      .split(",")
      .map((t: string) => t.trim()) as readonly string[];

    if (typeList.length !== values.length) {
      throw new HelperFunctionError(
        node,
        `expected ${typeList.length} value(s) for types "${types}", got ${values.length}`,
      );
    }

    try {
      const resolved = typeList.map((t, i) => toPackedValue(t, values[i]));
      return encodePacked(typeList as any, resolved as any);
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `encodePacked failed: ${(err as Error).message}`,
      );
    }
  },
  // compile: @abi.encodePacked!'s future on-chain face needs no Operators
  // encoder — packed encoding is pure composition over concat. Full-width
  // words (uint256/int256/bytes32) and dynamic payloads (string/bytes) go
  // straight into concat's parts (the compiler synthesizes the constant
  // envelopes around spliced words); each NARROWED part (uintN/address/
  // bool/bytesN) costs one slice over its word-as-bytes value, again with
  // a constant envelope: address = slice(w, 12, 20), bool/uintN =
  // slice(w, 32 - N/8, N/8), bytesN = slice(w, 0, N). One concat call
  // total, delimiterless — the @str.join! face already composes this way.
});
