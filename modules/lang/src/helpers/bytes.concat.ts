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
import { isHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "bytes.concat",
  description: "Concatenate bytes values together.",
  compileDescription:
    "Up to 4 parts may be live calls, the rest hex constants; each live part past the first is re-resolved by every later offset.",
  returnType: "bytes",
  args: [
    {
      name: "first",
      type: "bytes",
      description: "First bytes value",
    },
    {
      name: "rest",
      type: "bytes",
      description: "Bytes values to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    const items: string[] = [first, ...rest];
    return `0x${items.map((v) => v.slice(2)).join("")}`;
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2) {
      throw new ErrorException(
        "@bytes.concat! expects at least two parts, e.g. @bytes.concat!(0x1234 $oracle::blob())",
      );
    }
    const parts: BytesPart[] = [];
    for (const argNode of node.args) {
      if (argNode.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "bytes.concat!", argNode);
        requireBytesLike(arg, "bytes.concat!");
        parts.push(lensedDataOperand(ctx, arg));
      } else if (isBangHelperNode(argNode)) {
        const o = await compileOnchainHelper(ctx, argNode);
        if (o.kind !== "call" || (o.cat !== "Bytes" && o.cat !== "String")) {
          throw new ErrorException(
            "@bytes.concat! live parts must resolve bytes/string values",
          );
        }
        parts.push(o.param);
      } else {
        const value = await ctx.interpreters.interpretNode(argNode);
        if (typeof value !== "string" || !isHex(value)) {
          throw new ErrorException(
            "@bytes.concat! constant parts must be hex bytes values",
          );
        }
        parts.push(value);
      }
    }
    return { kind: "call", param: concatParam(ctx, parts), cat: "Bytes" };
  },
});
