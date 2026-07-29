import { defineHelper, Num } from "@evmcrispr/sdk";
import type Lang from "..";

function deepEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Num && b instanceof Num) return a.eq(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEquals(v, b[i]));
  }
  return a === b;
}

export default defineHelper<Lang>({
  name: "includes",
  description: "Check whether an array contains an element.",
  returnType: "bool",
  args: [
    { name: "value", type: "array", description: "Input value" },
    { name: "item", type: "any", description: "Element to search for" },
  ],
  async run(_, { value, item }) {
    return value.some((el: unknown) => deepEquals(el, item)) ? "true" : "false";
  },
});
