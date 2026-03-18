import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.replace",
  description: "Replace all occurrences of a substring.",
  returnType: "string",
  args: [
    { name: "s", type: "string", description: "Source string" },
    { name: "old", type: "string", description: "Substring to match" },
    { name: "replacement", type: "string", description: "Replacement text" },
  ],
  async run(_, { s, old, replacement }) {
    return String(s).replaceAll(String(old), String(replacement));
  },
});
