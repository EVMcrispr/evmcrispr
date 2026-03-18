import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "map",
  description: "Transform each element of an array by applying a helper.",
  returnType: "array",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "fn", type: "helper", description: "Transform helper applied to each element" },
  ],
  async run(_, { arr, fn }) {
    const results = [];
    for (const item of arr) {
      results.push(await fn(item));
    }
    return results;
  },
});
