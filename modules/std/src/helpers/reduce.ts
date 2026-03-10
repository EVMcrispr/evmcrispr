import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "reduce",
  description: "Reduce an array to a single value by applying a helper.",
  returnType: "any",
  args: [
    { name: "arr", type: "array" },
    { name: "fn", type: "helper" },
    { name: "initial", type: "any" },
  ],
  async run(_, { arr, fn, initial }) {
    let acc = initial;
    for (const item of arr) {
      acc = await fn(acc, item);
    }
    return acc;
  },
});
