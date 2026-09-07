import {
  type CallExpressionNode,
  defineHelper,
  ErrorException,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import {
  arrayLengthParam,
  compileCallValue,
  compileOnchainHelper,
  isBangHelperNode,
  lenParam,
  typedArrayArg,
  typedArrayFromOperand,
  typedArrayFromValue,
  wordCountParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "len",
  description:
    "Length of a value: element count for an array, byte length for a string or bytes.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array, string or bytes value",
    },
  ],
  async run(_, { value }) {
    return Num(BigInt(value.length));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@len! expects a single array or call argument");
    }
    const input = node.args[0];
    if (input.type !== NodeType.CallExpression && !isBangHelperNode(input)) {
      const array = await typedArrayArg(ctx, input, "len!");
      return { kind: "call", cat: "Uint", param: arrayLengthParam(ctx, array) };
    }
    if (node.args[0] && isBangHelperNode(node.args[0])) {
      const operand = await compileOnchainHelper(ctx, node.args[0]);
      if (
        operand.kind === "call" &&
        operand.collection?.transport === "words" &&
        !operand.collection.lanes
      )
        return {
          kind: "call",
          cat: "Uint",
          param: wordCountParam(ctx, operand.param),
        };
      const array = typedArrayFromOperand(ctx, operand, "len!");
      return {
        kind: "call",
        param: arrayLengthParam(ctx, array),
        cat: "Uint",
      };
    }
    const { param, terminal } = await compileCallValue(
      ctx,
      input as CallExpressionNode,
    );
    if (/\[\d*\]$/.test(terminal.type)) {
      const array = typedArrayFromValue(ctx, param, terminal, "len!");
      return { kind: "call", cat: "Uint", param: arrayLengthParam(ctx, array) };
    }
    if (terminal.type !== "string" && terminal.type !== "bytes") {
      throw new ErrorException(
        `@len! needs an array, string or bytes value, got ${terminal.type}`,
      );
    }
    return {
      kind: "call",
      param: lenParam(ctx, param, [terminal], [0]),
      cat: "Uint",
    };
  },
});
