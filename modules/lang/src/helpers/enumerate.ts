import { defineHelper, Num } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "enumerate",
  description: "Return an array of [index, element] pairs.",
  returnType: "array",
  args: [{ name: "arr", type: "array", description: "Source array" }],
  async run(_, { arr }) {
    return arr.map((el: unknown, i: number) => [Num(BigInt(i)), el]);
  },
});
