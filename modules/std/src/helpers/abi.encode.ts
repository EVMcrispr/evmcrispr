import {
  defineHelper,
  ErrorException,
  encodeParams,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import { concatParam } from "@evmcrispr/sdk/onchain";
import type { AbiParameter } from "viem";
import { parseAbiParameters } from "viem";
import type Std from "..";
import { buildAbiParts, isLiveNode } from "../utils/abiParts";

export default defineHelper<Std>({
  name: "abi.encode",
  description:
    "ABI-encode values given a comma-separated type list, like Solidity abi.encode.",
  compileDescription:
    "Live values must be elementary static types, at most 4 per call; dynamic, array and tuple types only encode when every value is constant.",
  returnType: "bytes",
  args: [
    {
      name: "types",
      type: "string",
      description: "Comma-separated Solidity types (e.g. `uint256,address`)",
    },
    {
      name: "values",
      type: "any",
      description: "Values to encode, one per type",
      rest: true,
    },
  ],
  async run(_, { types, values }, { node }) {
    let params: readonly AbiParameter[];
    try {
      params = parseAbiParameters(types) as readonly AbiParameter[];
    } catch (_err) {
      throw new HelperFunctionError(node, `invalid type list: "${types}"`);
    }

    try {
      return encodeParams(params, values, "abi.encode values");
    } catch (err) {
      throw new HelperFunctionError(node, (err as Error).message);
    }
  },
  // Standard encoding of static types is their head words concatenated,
  // so the face is one concat over full-width word parts. Dynamic types
  // would need their tails re-encoded through offsets — that recursive
  // re-encoder deliberately does not exist, so they stay constant.
  //
  // Operators has an `encode(string,bytes[])` entry, but it raw-returns
  // with no bytes envelope, so its result cannot ride as a bytes operand
  // in a composition — concat over words is strictly simpler here.
  compile: async (ctx, node) => {
    const [typesNode, ...valueNodes] = node.args;
    if (!typesNode || isLiveNode(typesNode)) {
      throw new ErrorException(
        "@abi.encode! type list must be a constant string",
      );
    }
    const types = String(await ctx.interpreters.interpretNode(typesNode));
    let params: readonly AbiParameter[];
    try {
      params = parseAbiParameters(types) as readonly AbiParameter[];
    } catch (_err) {
      throw new ErrorException(`@abi.encode! invalid type list: \`${types}\``);
    }
    if (params.length !== valueNodes.length) {
      throw new ErrorException(
        `@abi.encode! expected ${params.length} value(s), got ${valueNodes.length}`,
      );
    }
    if (!valueNodes.some(isLiveNode)) {
      const values: unknown[] = [];
      for (const n of valueNodes)
        values.push(await ctx.interpreters.interpretNode(n));
      try {
        return {
          kind: "const",
          cat: "Bytes",
          value: encodeParams(params, values as never, "abi.encode values"),
        };
      } catch (err) {
        throw new ErrorException(`@abi.encode! ${(err as Error).message}`);
      }
    }
    const parts = await buildAbiParts(
      ctx,
      params.map((p) => p.type),
      valueNodes,
      "head",
      "abi.encode!",
    );
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
