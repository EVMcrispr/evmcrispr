import type { Node } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  constOperand,
  formatParamType,
  isBangHelperNode,
  packedArrayOperand,
  zipParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { arrayArg } from "../utils/genericCollections";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "zip",
  description: "Combine two arrays element-wise into an array of pairs.",
  compileDescription:
    "Either or both sides may be live, a length mismatch reverts, and the result retains the type of each lane.",
  returnType: "array",
  args: [
    {
      name: "a",
      type: "array",
      description: "First array to zip",
    },
    { name: "b", type: "array", description: "Second array to zip" },
  ],
  async run(_, { a, b }) {
    if (a.length !== b.length) {
      throw new ErrorException("@zip arrays must have the same length");
    }
    const len = a.length;
    const result = [];
    for (let i = 0; i < len; i++) {
      result.push([a[i], b[i]]);
    }
    return result;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@zip! expects (a b), e.g. @zip!($safe::getOwners() [1 2 3])",
      );
    }
    const left = await arrayArg(ctx, node.args[0], "zip!");
    const right = await arrayArg(ctx, node.args[1], "zip!");
    if (!left.words || !right.words) {
      const values = collectionReadParam(ctx, "zipValues", [
        { kind: "value", value: formatParamType(left.element) },
        { kind: "value", value: formatParamType(right.element) },
        canonicalArgSpec(ctx, { type: "bytes[]" }, arrayValuesParam(ctx, left)),
        canonicalArgSpec(
          ctx,
          { type: "bytes[]" },
          arrayValuesParam(ctx, right),
        ),
      ]);
      return packedArrayOperand(ctx, values, {
        type: "tuple",
        components: [left.element, right.element],
      });
    }
    const laneTypes: string[] = [];
    const side = async (argNode: Node, label: string): Promise<BytesPart> => {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        const part = await wordsArg(ctx, argNode, "zip!");
        laneTypes.push(part.elemType);
        return { param: part.payload, aligned: true };
      }
      const values = await ctx.interpreters.interpretNode(argNode);
      const first = Array.isArray(values) ? values[0] : undefined;
      const cat = first === undefined ? "Uint" : constOperand(first).cat;
      laneTypes.push(
        cat === "Int"
          ? "int256"
          : cat === "Address"
            ? "address"
            : cat === "Bool"
              ? "bool"
              : cat === "Bytes32"
                ? "bytes32"
                : "uint256",
      );
      return constWordsPayload(ctx, argNode, `zip! ${label}`);
    };
    const a = await side(node.args[0], "a");
    const b = await side(node.args[1], "b");
    return {
      kind: "call",
      param: zipParam(ctx, a, b),
      cat: "Bytes",
      collection: {
        element: { type: "uint256" },
        transport: "words",
        lanes: laneTypes.map((type) => ({ type })),
      },
    };
  },
});
