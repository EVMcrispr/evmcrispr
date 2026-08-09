import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import { concatParam, isBangHelperNode } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "concat",
  description:
    "Concatenate arrays together. As @concat! the parts' word payloads concatenate on-chain through Operators.concat — constant arrays plus at most one live call part (spliced into the calldata last, at any argument position).",
  returnType: "array",
  args: [
    {
      name: "first",
      type: "array",
      description:
        "First array to concatenate (in @concat! a `::` call, nested array face, or constant array literal)",
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
    let liveParts = 0;
    for (const argNode of node.args) {
      if (
        argNode.type === NodeType.CallExpression ||
        isBangHelperNode(argNode)
      ) {
        liveParts++;
        parts.push((await wordsArg(ctx, argNode, "concat!")).payload);
      } else {
        parts.push(await constWordsPayload(ctx, argNode, "concat!"));
      }
    }
    if (liveParts > 1) {
      throw new ErrorException(
        "@concat! concatenates constant parts with at most ONE live part — later offsets would depend on the live value's length",
      );
    }
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
