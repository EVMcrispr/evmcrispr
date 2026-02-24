import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "range",
  description: "Generate an array of sequential integers from start (inclusive) to end (exclusive).",
  returnType: "array",
  args: [
    { name: "start", type: "number" },
    { name: "end", type: "number" },
  ],
  async run(_, { start, end }) {
    const s = Num.coerce(start).toBigInt();
    const e = Num.coerce(end).toBigInt();

    if (e - s > 10_000n) {
      throw new ErrorException("@range: maximum length is 10,000");
    }

    const result: Num[] = [];
    for (let i = s; i < e; i++) {
      result.push(new Num(i));
    }
    return result;
  },
});
