import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.join",
  description: "Join array elements into a string with a delimiter.",
  returnType: "string",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "delim", type: "string", description: "Delimiter string" },
  ],
  async run(_, { arr, delim }) {
    return arr.map((el: unknown) => String(el)).join(String(delim));
  },
});
