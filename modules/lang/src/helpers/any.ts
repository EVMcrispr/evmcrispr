import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "any",
  description: "Return true if at least one element satisfies the predicate.",
  returnType: "bool",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "fn", type: "helper", description: "Predicate helper returning bool" },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        return "true";
      }
    }
    return "false";
  },
});
