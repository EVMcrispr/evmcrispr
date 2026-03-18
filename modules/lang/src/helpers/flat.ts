import type { Param } from "@evmcrispr/sdk";
import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "flat",
  description: "Flatten one level of nesting in an array.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    const result: Param[] = [];
    for (const item of arr) {
      if (Array.isArray(item)) {
        result.push(...item);
      } else {
        result.push(item);
      }
    }
    return result;
  },
});
