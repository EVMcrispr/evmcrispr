import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.split",
  description: "Split a string by a delimiter into an array of strings.",
  returnType: "array",
  args: [
    { name: "s", type: "string" },
    { name: "delim", type: "string" },
  ],
  async run(_, { s, delim }) {
    return String(s).split(String(delim));
  },
});
