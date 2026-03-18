import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.upper",
  description: "Convert a string to uppercase.",
  returnType: "string",
  args: [{ name: "s", type: "string", description: "Source string" }],
  async run(_, { s }) {
    return String(s).toUpperCase();
  },
});
