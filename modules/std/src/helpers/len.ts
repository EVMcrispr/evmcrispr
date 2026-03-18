import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "len",
  description: "Return the length of an array.",
  returnType: "number",
  args: [{ name: "value", type: "array", description: "Input value" }],
  async run(_, { value }) {
    return Num(BigInt(value.length));
  },
});
