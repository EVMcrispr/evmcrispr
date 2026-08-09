import type { ArrayExpressionNode, Node } from "@evmcrispr/sdk";
import { defineHelper, ErrorException, NodeType } from "@evmcrispr/sdk";
import type { BytesPart } from "@evmcrispr/sdk/onchain";
import {
  chainArgWithLens,
  compileOnchainHelper,
  isBangHelperNode,
  joinParam,
  lensedDataOperand,
  requireBytesLike,
} from "@evmcrispr/sdk/onchain";
import { stringToHex } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.join",
  description:
    "Join array elements into a string with a delimiter. As @str.join! the parts join on-chain through Operators.join — constant strings plus at most one live call part (spliced into the calldata last, at any position in the list).",
  returnType: "string",
  args: [
    {
      name: "arr",
      type: "array",
      description:
        "Source array (in @str.join! an array literal of constant strings and at most one `::` call part)",
    },
    { name: "delim", type: "string", description: "Delimiter string" },
  ],
  async run(_, { arr, delim }) {
    return arr.map((el: unknown) => String(el)).join(String(delim));
  },
  compile: async (ctx, node) => {
    if (
      node.args.length !== 2 ||
      node.args[0].type !== NodeType.ArrayExpression
    ) {
      throw new ErrorException(
        '@str.join! expects ([parts…] delim), e.g. @str.join!(["v" $reg::version()] ".")',
      );
    }
    const elements = (node.args[0] as ArrayExpressionNode)
      .elements as unknown as Node[];
    const delim = await ctx.interpreters.interpretNode(node.args[1]);
    if (typeof delim !== "string") {
      throw new ErrorException("@str.join! delimiter must be a string");
    }
    const parts: BytesPart[] = [];
    let liveParts = 0;
    for (const element of elements) {
      if (element.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "str.join!", element);
        requireBytesLike(arg, "str.join!");
        parts.push(lensedDataOperand(ctx, arg));
        liveParts++;
      } else if (isBangHelperNode(element)) {
        const o = await compileOnchainHelper(ctx, element);
        if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
          throw new ErrorException(
            "@str.join! live parts must resolve string/bytes values",
          );
        }
        parts.push(o.param);
        liveParts++;
      } else {
        const value = await ctx.interpreters.interpretNode(element);
        if (typeof value !== "string") {
          throw new ErrorException("@str.join! constant parts must be strings");
        }
        parts.push(stringToHex(value));
      }
    }
    if (liveParts > 1) {
      throw new ErrorException(
        "@str.join! joins constant parts with at most ONE live part — later offsets would depend on the live value's length",
      );
    }
    return {
      kind: "call",
      param: joinParam(ctx, parts, stringToHex(delim)),
      cat: "String",
    };
  },
});
