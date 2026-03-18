import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.includes",
  description: "Check whether a string contains a substring.",
  returnType: "bool",
  args: [
    { name: "value", type: "string", description: "Input value" },
    { name: "item", type: "string", description: "Substring to search for" },
  ],
  async run(_, { value, item }) {
    return String(value).includes(String(item)) ? "true" : "false";
  },
});
