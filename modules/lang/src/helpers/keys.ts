import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "keys",
  description:
    "Return the entry names of a record (`[a:1 b:2]` or `[name value]` pairs) as an array.",
  returnType: "array",
  args: [
    {
      name: "record",
      type: "record",
      description: "Record (entries array) to read the names from",
    },
  ],
  async run(_, { record }) {
    return (record as [string, unknown][]).map(([name]) => String(name));
  },
});
