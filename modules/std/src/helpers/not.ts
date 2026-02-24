import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "not",
  description: "Logical NOT of a boolean value.",
  returnType: "bool",
  args: [{ name: "value", type: "bool" }],
  async run(_, { value }) {
    return !value ? "true" : "false";
  },
});
