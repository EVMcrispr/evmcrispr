import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "arr",
  description:
    "Generate an array of sequential integers from start (inclusive) to end (exclusive).",
  returnType: "array",
  args: [
    { name: "start", type: "number", description: "Start value (inclusive)" },
    { name: "end", type: "number", description: "End value (exclusive)" },
  ],
  async run(_, { start, end }) {
    const s = Num(start).toBigInt();
    const e = Num(end).toBigInt();

    if (e - s > 10_000n) {
      throw new ErrorException("@arr: maximum length is 10,000");
    }

    const result: Num[] = [];
    for (let i = s; i < e; i++) {
      result.push(Num(i));
    }
    return result;
  },
});
