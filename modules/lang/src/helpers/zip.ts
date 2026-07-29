import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "zip",
  description: "Combine two arrays element-wise into an array of pairs.",
  returnType: "array",
  args: [
    { name: "a", type: "array", description: "First array to zip" },
    { name: "b", type: "array", description: "Second array" },
  ],
  async run(_, { a, b }) {
    const len = Math.min(a.length, b.length);
    const result = [];
    for (let i = 0; i < len; i++) {
      result.push([a[i], b[i]]);
    }
    return result;
  },
});
