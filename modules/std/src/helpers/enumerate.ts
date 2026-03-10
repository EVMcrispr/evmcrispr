import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "enumerate",
  description: "Return an array of [index, element] pairs.",
  returnType: "array",
  args: [{ name: "arr", type: "array" }],
  async run(_, { arr }) {
    return arr.map((el: unknown, i: number) => [new Num(BigInt(i)), el]);
  },
});
