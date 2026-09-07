import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  enumerateParam,
  wordCountParam,
  wordsArg,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

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
    const { payload, elemType } = await wordsArg(
      ctx,
      node.args[0],
      "enumerate!",
    );
    const n = wordCountParam(ctx, payload);
    return {
      kind: "call",
      param: enumerateParam(ctx, payload, n),
      cat: "Bytes",
      collection: {
        element: { type: "uint256" },
        transport: "words",
        lanes: [{ type: "uint256" }, { type: elemType }],
      },
    };
  },
});
