import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "find",
  description: "Return the first element that satisfies the predicate.",
  returnType: "any",
  args: [
    { name: "arr", type: "array" },
    { name: "fn", type: "helper" },
  ],
  async run(_, { arr, fn }) {
    for (const item of arr) {
      const result = await fn(item);
      if (result === true || result === "true") {
        return item;
      }
    }
    throw new ErrorException("@find: no element matched the predicate");
  },
});
