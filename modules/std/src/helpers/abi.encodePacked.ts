import { defineHelper, HelperFunctionError, Num } from "@evmcrispr/sdk";
import { encodePacked } from "viem";
import type Std from "..";

function toPackedValue(type: string, v: unknown): unknown {
  if (v instanceof Num) return v.toBigInt();
  if (type.startsWith("uint") || type.startsWith("int")) return BigInt(String(v));
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
    const typeList = types.split(",").map((t: string) => t.trim()) as readonly string[];

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
});
