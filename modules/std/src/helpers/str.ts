import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str",
  description: "Convert a value to its string representation.",
  returnType: "string",
  args: [{ name: "value", type: "any", description: "Input value" }],
  async run(_, { value }) {
    return String(value);
  },
});
