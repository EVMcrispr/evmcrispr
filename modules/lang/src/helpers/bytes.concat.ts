import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "bytes.concat",
  description: "Concatenate bytes values together.",
  returnType: "bytes",
  args: [
    { name: "first", type: "bytes", description: "First bytes value" },
    { name: "rest", type: "bytes", description: "Bytes values to append", rest: true },
  ],
  async run(_, { first, rest }) {
    const items: string[] = [first, ...rest];
    return "0x" + items.map((v) => v.slice(2)).join("");
  },
});
