import { defineHelper, ErrorException, type Param } from "@evmcrispr/sdk";
import { unzipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "values",
  description:
    "Return the entry values of a record (`[a:1 b:2]` or `[name value]` pairs) as an array. As @values! lane 1 of an on-chain record — a zipped key/value word-pair payload (what @zip!/@enumerate! produce; string keys travel as their keccak digests) — selected through unzipWords.",
  returnType: "array",
  args: [
    {
      name: "record",
      type: "record",
      description:
        "Record (entries array) to read the values from (in @values! a zipped word-pair payload: a nested @zip!/@enumerate! face or a `::` call returning the interleaved pairs)",
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
    const { payload } = await wordsArg(ctx, node.args[0], "values!");
    return { kind: "call", param: unzipParam(ctx, payload, 1n), cat: "Bytes" };
  },
});
