import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  chainArgWithLens,
  compileOnchainHelper,
  concatParam,
  isBangHelperNode,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.concat",
  description: "Concatenate strings together.",
  compileDescription:
    "At most one part may be a live call; the rest must be string constants.",
  returnType: "string",
  args: [
    {
      name: "first",
      type: "string",
      description: "First string segment",
    },
    {
      name: "rest",
      type: "string",
      description: "Strings to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].join("");
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2) {
      throw new ErrorException(
        '@str.concat! expects at least two parts, e.g. @str.concat!("v" $reg::version())',
      );
    }
    const parts: BytesPart[] = [];
    let liveParts = 0;
    for (const argNode of node.args) {
      if (argNode.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "str.concat!", argNode);
        requireBytesLike(arg, "str.concat!");
        parts.push(lensedDataOperand(ctx, arg));
        liveParts++;
      } else if (isBangHelperNode(argNode)) {
        const o = await compileOnchainHelper(ctx, argNode);
        if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
          throw new ErrorException(
            "@str.concat! live parts must resolve string/bytes values",
          );
        }
        parts.push(o.param);
        liveParts++;
      } else {
        const value = await ctx.interpreters.interpretNode(argNode);
        if (typeof value !== "string") {
          throw new ErrorException(
            "@str.concat! constant parts must be strings",
          );
        }
        parts.push(stringToHex(value));
      }
    }
    if (liveParts > 1) {
      throw new ErrorException(
        "@str.concat! concatenates constant parts with at most ONE live part — later offsets would depend on the live value's length",
      );
    }
    return { kind: "call", param: concatParam(ctx, parts), cat: "String" };
  },
});
