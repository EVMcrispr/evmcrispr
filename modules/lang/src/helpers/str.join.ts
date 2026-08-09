import type { ArrayExpressionNode, Node } from "@evmcrispr/sdk";
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
  name: "str.join",
  description:
    "Join array elements into a string with a delimiter. As @str.join! the parts join on-chain through a single Operators.concat call — the delimiter interleaves between the parts at composition time (constant runs merge into one part); constant strings plus at most one live call part (spliced into the calldata last, at any position in the list).",
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
    // The delimiter interleaves between the parts at composition time:
    // constant runs (part + delimiter + part …) merge into ONE constant
    // concat part, so the whole join is a single Operators.concat call
    // with no join function on-chain.
    const parts: BytesPart[] = [];
    let liveParts = 0;
    let constRun: string | null = null;
    const flushConstRun = () => {
      if (constRun !== null) {
        parts.push(stringToHex(constRun));
        constRun = null;
      }
    };
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const sep = i > 0 ? delim : "";
      let live: BytesPart | undefined;
      if (element.type === NodeType.CallExpression) {
        const arg = await chainArgWithLens(ctx, "str.join!", element);
        requireBytesLike(arg, "str.join!");
        live = lensedDataOperand(ctx, arg);
      } else if (isBangHelperNode(element)) {
        const o = await compileOnchainHelper(ctx, element);
        if (o.kind !== "call" || (o.cat !== "String" && o.cat !== "Bytes")) {
          throw new ErrorException(
            "@str.join! live parts must resolve string/bytes values",
          );
        }
        live = o.param;
      }
      if (live) {
        if (sep) constRun = (constRun ?? "") + sep;
        flushConstRun();
        parts.push(live);
        liveParts++;
        continue;
      }
      const value = await ctx.interpreters.interpretNode(element);
      if (typeof value !== "string") {
        throw new ErrorException("@str.join! constant parts must be strings");
      }
      constRun = (constRun ?? "") + sep + value;
    }
    flushConstRun();
    if (liveParts > 1) {
      throw new ErrorException(
        "@str.join! joins constant parts with at most ONE live part — later offsets would depend on the live value's length",
      );
    }
    return {
      kind: "call",
      param: concatParam(ctx, parts),
      cat: "String",
    };
  },
});
