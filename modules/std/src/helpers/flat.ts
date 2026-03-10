import type { Param } from "@evmcrispr/sdk";
import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "flat",
  description: "Flatten one level of nesting in an array.",
  returnType: "array",
  args: [{ name: "arr", type: "array" }],
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
