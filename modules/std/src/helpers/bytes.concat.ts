import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "bytes.concat",
  description: "Concatenate bytes values together.",
  returnType: "bytes",
  args: [
    { name: "first", type: "bytes" },
    { name: "rest", type: "bytes", rest: true },
  ],
  async run(_, { first, rest }) {
    const items: string[] = [first, ...rest];
    return "0x" + items.map((v) => v.slice(2)).join("");
  },
});
