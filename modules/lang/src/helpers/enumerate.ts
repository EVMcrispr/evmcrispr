import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  byteLenParamOf,
  chainArgWithLens,
  enumerateParam,
  isBangHelperNode,
  lenParam,
  rawParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordArrayPath, wordsArg, wordsPayload } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "enumerate",
  description: "Pair every element of an array with its index.",
  compileDescription:
    "The result is a record, readable with `@keys!`, `@values!` and `@lookup!`.",
  returnType: "array",
  args: [
    {
      name: "arr",
      type: "array",
      description: "Source array",
    },
  ],
  async run(_, { arr }) {
    return arr.map((el: unknown, i: number) => [Num(BigInt(i)), el]);
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@enumerate! expects a single call argument, e.g. @enumerate!($safe::getOwners())",
      );
    }
    const argNode = node.args[0];
    if (argNode && isBangHelperNode(argNode)) {
      // Nested array face: the payload is already a words value, so the
      // live count is its byte length over 32.
      const { payload } = await wordsArg(ctx, argNode, "enumerate!");
      const n = wordOpParam(
        ctx,
        "div",
        false,
        byteLenParamOf(ctx, payload),
        rawParam(toWord(32n)),
      );
      return {
        kind: "call",
        param: enumerateParam(ctx, payload, n),
        cat: "Bytes",
      };
    }
    const arg = await chainArgWithLens(ctx, "enumerate!", argNode);
    const { path } = wordArrayPath(arg, "enumerate!");
    const payload = wordsPayload(ctx, arg, path);
    // The live element count through the existing LEN-sentinel plumbing.
    const n = lenParam(ctx, arg.param, arg.outputs, path);
    return {
      kind: "call",
      param: enumerateParam(ctx, payload, n),
      cat: "Bytes",
    };
  },
});
