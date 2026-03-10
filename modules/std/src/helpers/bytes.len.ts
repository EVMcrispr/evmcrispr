import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "bytes.len",
  description: "Return the byte length of a bytes value.",
  returnType: "number",
  args: [{ name: "value", type: "bytes" }],
  async run(_, { value }) {
    return Num(BigInt((String(value).length - 2) / 2));
  },
});
