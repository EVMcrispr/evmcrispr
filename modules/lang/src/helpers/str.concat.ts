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
    "Up to 4 parts may be live calls, the rest string constants; each live part past the first is re-resolved by every later offset.",
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
    for (const argNode of node.args) {
      if (argNode.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "str.concat!", argNode);
        requireBytesLike(arg, "str.concat!");
        parts.push(lensedDataOperand(ctx, arg));
      } else if (isBangHelperNode(argNode)) {
        const o = await compileOnchainHelper(ctx, argNode);
        if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
          throw new ErrorException(
            "@str.concat! live parts must resolve string/bytes values",
          );
        }
        parts.push(o.param);
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
    return { kind: "call", param: concatParam(ctx, parts), cat: "String" };
  },
});
