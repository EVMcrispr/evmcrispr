import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "map",
  description: "Transform each element of an array by applying a helper.",
  returnType: "array",
  args: [
    { name: "arr", type: "array" },
    { name: "fn", type: "helper" },
  ],
  async run(_, { arr, fn }) {
    const results = [];
    for (const item of arr) {
      results.push(await fn(item));
    }
    return results;
  },
});
