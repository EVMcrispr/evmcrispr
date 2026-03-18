import { Num, defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "bytes.len",
  description: "Return the byte length of a bytes value.",
  returnType: "number",
  args: [{ name: "value", type: "bytes", description: "Input value" }],
  async run(_, { value }) {
    return Num(BigInt((String(value).length - 2) / 2));
  },
});
