import { defineHelper, Num } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "len",
  description: "Return the length of an array.",
  returnType: "number",
  args: [{ name: "value", type: "array", description: "Input value" }],
  async run(_, { value }) {
    return Num(BigInt(value.length));
  },
});
