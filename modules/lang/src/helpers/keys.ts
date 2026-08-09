import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { unzipParam } from "@evmcrispr/sdk/onchain";
import type Lang from "..";
import { wordsArg } from "../utils/onchain";

export default defineHelper<Lang>({
  name: "keys",
  description:
    "Return the entry names of a record (`[a:1 b:2]` or `[name value]` pairs) as an array. As @keys! lane 0 of an on-chain record — a zipped key/value word-pair payload (what @zip!/@enumerate! produce; string keys travel as their keccak digests) — selected through unzipWords.",
  returnType: "array",
  args: [
    {
      name: "record",
      type: "record",
      description:
        "Record (entries array) to read the names from (in @keys! a zipped word-pair payload: a nested @zip!/@enumerate! face or a `::` call returning the interleaved pairs)",
    },
  ],
  async run(_, { record }) {
    return (record as [string, unknown][]).map(([name]) => String(name));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@keys! expects a single record argument, e.g. @keys!(@enumerate!($safe::getOwners()))",
      );
    }
    const { payload } = await wordsArg(ctx, node.args[0], "keys!");
    return { kind: "call", param: unzipParam(ctx, payload, 0n), cat: "Bytes" };
  },
});
