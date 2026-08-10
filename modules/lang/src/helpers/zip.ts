import type { Node } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import { isBangHelperNode, zipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "zip",
  description: "Combine two arrays element-wise into an array of pairs.",
  compileDescription:
    "Either or both sides may be live, a length mismatch reverts, and the result is a flat word-pair payload, so `@len!` counts words rather than pairs.",
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
    const len = Math.min(a.length, b.length);
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
    const side = async (argNode: Node, label: string): Promise<BytesPart> => {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        return {
          param: (await wordsArg(ctx, argNode, "zip!")).payload,
          aligned: true,
        };
      }
      return constWordsPayload(ctx, argNode, `zip! ${label}`);
    };
    const a = await side(node.args[0], "a");
    const b = await side(node.args[1], "b");
    return { kind: "call", param: zipParam(ctx, a, b), cat: "Bytes" };
  },
});
