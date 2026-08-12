import {
  defineHelper,
  ErrorException,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import { concatParam } from "@evmcrispr/sdk/onchain";
import { encodePacked } from "viem";
import type Std from "..";
import { buildAbiParts, isLiveNode, toPackedValue } from "../utils/abiParts";

export default defineHelper<Std>({
  name: "abi.encodePacked",
  description:
    "ABI non-standard packed encoding, matching Solidity's abi.encodePacked.",
  compileDescription:
    "Live values are cut to their packed width and live string/bytes values pass through whole, at most 4 per call; the type list, arrays and tuples stay constant.",
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
  // Packed encoding is pure composition over concat: every live part is
  // one slice cutting its word to width (a live word is sliced even at
  // full width, which synthesizes the bytes envelope concat expects), a
  // live string/bytes payload rides whole, and constants merge into
  // single hex runs — one concat call total, the way @str.join! composes.
  compile: async (ctx, node) => {
    const [typesNode, ...valueNodes] = node.args;
    if (!typesNode || isLiveNode(typesNode)) {
      throw new ErrorException(
        "@abi.encodePacked! type list must be a constant string",
      );
    }
    const types = String(await ctx.interpreters.interpretNode(typesNode))
      .split(",")
      .map((t) => t.trim());
    if (types.length !== valueNodes.length) {
      throw new ErrorException(
        `@abi.encodePacked! expected ${types.length} value(s), got ${valueNodes.length}`,
      );
    }
    if (!valueNodes.some(isLiveNode)) {
      const values: unknown[] = [];
      for (const n of valueNodes)
        values.push(await ctx.interpreters.interpretNode(n));
      try {
        const resolved = types.map((t, i) => toPackedValue(t, values[i]));
        return {
          kind: "const",
          cat: "Bytes",
          value: encodePacked(types as never, resolved as never),
        };
      } catch (err) {
        throw new ErrorException(
          `@abi.encodePacked! failed: ${(err as Error).message}`,
        );
      }
    }
    const parts = await buildAbiParts(
      ctx,
      types,
      valueNodes,
      "packed",
      "abi.encodePacked!",
    );
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
