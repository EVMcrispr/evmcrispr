import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "reduce",
  description: "Reduce an array to a single value by applying a helper.",
  returnType: "any",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    { name: "fn", type: "helper", description: "Reducer helper receiving `(accumulator, element)`" },
    { name: "initial", type: "any", description: "Initial accumulator value" },
  ],
  async run(_, { arr, fn, initial }) {
    let acc = initial;
    for (const item of arr) {
      acc = await fn(acc, item);
    }
    return acc;
  },
});
