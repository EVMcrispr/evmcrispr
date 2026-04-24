import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "find",
  description: "Return the first element that satisfies the predicate.",
  returnType: "any",
  args: [
    { name: "arr", type: "array", description: "Source array" },
    {
      name: "fn",
      type: "helper",
      description: "Predicate helper returning bool",
    },
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
