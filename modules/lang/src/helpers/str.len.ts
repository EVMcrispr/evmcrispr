import { defineHelper, Num } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.len",
  description: "Return the length of a string.",
  returnType: "number",
  args: [{ name: "value", type: "string", description: "Input value" }],
  async run(_, { value }) {
    return Num(BigInt(String(value).length));
  },
});
