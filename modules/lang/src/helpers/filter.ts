import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "filter",
  description: "Keep elements of an array for which a helper returns truthy.",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "fn", type: "helper", description: "Predicate helper returning bool" },
  ],
  async run(_, { arr, fn }) {
    const results = [];
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        results.push(item);
      }
    }
    return results;
  },
});
