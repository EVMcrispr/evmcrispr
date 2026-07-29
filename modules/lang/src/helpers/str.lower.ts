import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.lower",
  description: "Convert a string to lowercase.",
  returnType: "string",
  args: [{ name: "s", type: "string", description: "Source string" }],
  async run(_, { s }) {
    return String(s).toLowerCase();
  },
});
