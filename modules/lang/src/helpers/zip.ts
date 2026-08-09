import type { Node } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import { isBangHelperNode, zipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "zip",
  description:
    "Combine two arrays element-wise into an array of pairs. As @zip! the two word payloads interleave on-chain through zipWords — at most one side live, and a word-count mismatch reverts at assertion time.",
  returnType: "array",
  args: [
    {
      name: "a",
      type: "array",
      description:
        "First array to zip (in @zip! a `::` call, nested array face, or constant array literal)",
    },
    { name: "b", type: "array", description: "Second array" },
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
    let liveParts = 0;
    const side = async (argNode: Node, label: string): Promise<BytesPart> => {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        liveParts++;
        return (await wordsArg(ctx, argNode, "zip!")).payload;
      }
      return constWordsPayload(ctx, argNode, `zip! ${label}`);
    };
    const a = await side(node.args[0], "a");
    const b = await side(node.args[1], "b");
    if (liveParts > 1) {
      throw new ErrorException(
        "@zip! interleaves at most ONE live side with a constant one — the second live offset would depend on the first value's length",
      );
    }
    return { kind: "call", param: zipParam(ctx, a, b), cat: "Bytes" };
  },
});
