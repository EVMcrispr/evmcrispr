import type { ArrayExpressionNode, Node, Param } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import { concatParam, isBangHelperNode } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { constWordsPayload, wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "flat",
  description: "Flatten one level of nesting in an array.",
  compileDescription:
    "At most one element may be a live call; the rest must be constant arrays.",
  returnType: "array",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array of arrays",
    },
  ],
  async run(_, { arr }) {
    const result: Param[] = [];
    for (const item of arr) {
      if (Array.isArray(item)) {
        result.push(...item);
      } else {
        result.push(item);
      }
    }
    return result;
  },
  compile: async (ctx, node) => {
    if (
      node.args.length !== 1 ||
      node.args[0].type !== NodeType.ArrayExpression
    ) {
      throw new ErrorException(
        "@flat! expects an array literal of parts, e.g. @flat!([[1 2] $safe::getOwners()])",
      );
    }
    const elements = (node.args[0] as ArrayExpressionNode)
      .elements as unknown as Node[];
    const parts: BytesPart[] = [];
    let liveParts = 0;
    for (const element of elements) {
      if (
        element.type === NodeType.CallExpression ||
        isBangHelperNode(element)
      ) {
        liveParts++;
        parts.push((await wordsArg(ctx, element, "flat!")).payload);
      } else {
        parts.push(await constWordsPayload(ctx, element, "flat!"));
      }
    }
    if (liveParts > 1) {
      throw new ErrorException(
        "@flat! concatenates constant parts with at most ONE live part — later offsets would depend on the live value's length",
      );
    }
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
