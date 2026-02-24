import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

function deepEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Num && b instanceof Num) return a.eq(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEquals(v, b[i]));
  }
  return a === b;
}

export default defineHelper<Std>({
  name: "includes",
  description: "Check whether a string contains a substring or an array contains an element.",
  returnType: "bool",
  args: [
    { name: "value", type: ["string", "array"] },
    { name: "item", type: "any" },
  ],
  async run(_, { value, item }) {
    if (Array.isArray(value)) {
      return value.some((el) => deepEquals(el, item)) ? "true" : "false";
    }
    return String(value).includes(String(item)) ? "true" : "false";
  },
});
