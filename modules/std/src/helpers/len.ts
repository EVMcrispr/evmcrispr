import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "len",
  description: "Return the length of a string or array.",
  returnType: "number",
  args: [{ name: "value", type: ["string", "array"] }],
  async run(_, { value }) {
    if (Array.isArray(value)) {
      return new Num(BigInt(value.length));
    }
    return new Num(BigInt(String(value).length));
  },
});
