import type { Param } from "@evmcrispr/sdk";
import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "unzip",
  description: "Transpose an array of pairs into two separate arrays.",
  returnType: "array",
  args: [{ name: "pairs", type: "array", description: "Array of [a, b] pairs" }],
  async run(_, { pairs }) {
    const firsts: Param[] = [];
    const seconds: Param[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new ErrorException(
          `@unzip: element at index ${i} is not a two-element array`,
        );
      }
      firsts.push(pair[0]);
      seconds.push(pair[1]);
    }
    return [firsts, seconds];
  },
});
