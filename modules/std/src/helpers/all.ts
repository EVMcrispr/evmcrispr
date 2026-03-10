import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "all",
  description: "Return true if every element satisfies the predicate.",
  returnType: "bool",
  args: [
    { name: "arr", type: "array" },
    { name: "fn", type: "helper" },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result !== true && result !== "true") {
        return "false";
      }
    }
    return "true";
  },
});
