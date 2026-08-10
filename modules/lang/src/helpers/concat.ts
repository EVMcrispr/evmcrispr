import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import { concatParam, isBangHelperNode } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "concat",
  description: "Concatenate arrays together.",
  compileDescription:
    "Up to 4 parts may be live calls; each live part past the first is re-resolved by every later part's offset.",
  returnType: "array",
  args: [
    {
      name: "first",
      type: "array",
      description: "First array to concatenate",
    },
    {
      name: "rest",
      type: "array",
      description: "Additional arrays to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].flat();
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2) {
      throw new ErrorException(
        "@concat! expects at least two array parts, e.g. @concat!($safe::getOwners() [1 2])",
      );
    }
    const parts: BytesPart[] = [];
    for (const argNode of node.args) {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        parts.push({
          param: (await wordsArg(ctx, argNode, "concat!")).payload,
          aligned: true,
        });
      } else {
        parts.push(await constWordsPayload(ctx, argNode, "concat!"));
      }
    }
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
