import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.concat",
  description: "Concatenate strings together.",
  returnType: "string",
  args: [
    { name: "first", type: "string" },
    { name: "rest", type: "string", description: "Strings to append", rest: true },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].join("");
  },
});
