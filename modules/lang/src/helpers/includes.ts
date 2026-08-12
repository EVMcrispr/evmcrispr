import { defineHelper, valueEq } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "includes",
  description: "Check whether an array contains an element.",
  returnType: "bool",
  args: [
    { name: "value", type: "array", description: "Input value" },
    { name: "item", type: "any", description: "Element to search for" },
  ],
  async run(_, { value, item }) {
    return value.some((el: unknown) => valueEq(el, item)) ? "true" : "false";
  },
});
