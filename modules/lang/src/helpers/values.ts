import { defineHelper, ErrorException, type Param } from "@evmcrispr/sdk";
import { unzipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { genericLane } from "../utils/genericCollections";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "values",
  description:
    "Entry values of a record (`[a:1 b:2]` or `[name value]` pairs), as an array.",
  compileDescription:
    "The record is the word-pair payload `@zip!` and `@enumerate!` produce, and string names travel as their keccak digests.",
  returnType: "array",
  args: [
    {
      name: "record",
      type: "record",
      description: "Record (entries array) to read the values from",
    },
  ],
  async run(_, { record }) {
    return (record as [string, Param][]).map(([, value]) => value);
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@values! expects a single record argument, e.g. @values!(@enumerate!($safe::getOwners()))",
      );
    }
    const generic = await genericLane(ctx, node.args[0], 1, "values!");
    if (generic) return generic;
    const { payload, elemType, lanes } = await wordsArg(
      ctx,
      node.args[0],
      "values!",
    );
    return {
      kind: "call",
      param: unzipParam(ctx, payload, 1n),
      cat: "Bytes",
      collection: {
        element: lanes?.[1] ?? { type: elemType },
        transport: "words",
      },
    };
  },
});
