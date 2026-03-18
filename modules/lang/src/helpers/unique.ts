import type { Param } from "@evmcrispr/sdk";
import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "unique",
  description: "Remove duplicates from an array, preserving first-occurrence order.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    const seen = new Set<string>();
    const result: Param[] = [];
    for (const item of arr) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  },
});
