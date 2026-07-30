import { defineHelper, type Param } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "values",
  description:
    "Return the entry values of a record (`[a:1 b:2]` or `[name value]` pairs) as an array.",
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
});
