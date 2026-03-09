import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.includes",
  description: "Check whether a string contains a substring.",
  returnType: "bool",
  args: [
    { name: "value", type: "string" },
    { name: "item", type: "string" },
  ],
  async run(_, { value, item }) {
    return String(value).includes(String(item)) ? "true" : "false";
  },
});
