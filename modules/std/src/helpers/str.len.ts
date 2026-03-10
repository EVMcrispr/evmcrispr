import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.len",
  description: "Return the length of a string.",
  returnType: "number",
  args: [{ name: "value", type: "string" }],
  async run(_, { value }) {
    return Num(BigInt(String(value).length));
  },
});
