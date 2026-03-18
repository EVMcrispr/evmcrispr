import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
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
