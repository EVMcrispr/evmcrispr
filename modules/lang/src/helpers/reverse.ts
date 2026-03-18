import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "reverse",
  description: "Return a new array with elements in reverse order.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    return [...arr].reverse();
  },
});
