import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "and",
  description: "Logical AND of two boolean values.",
  returnType: "bool",
  args: [
    { name: "a", type: "bool" },
    { name: "b", type: "bool" },
  ],
  async run(_, { a, b }) {
    return a && b ? "true" : "false";
  },
});
