import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "at",
  description: "Access an element by index in an array.",
  returnType: "any",
  args: [
    { name: "value", type: "array" },
    { name: "index", type: "number" },
  ],
  async run(_, { value, index }) {
    const i = Number(Num.coerce(index).toBigInt());
    const resolved = i < 0 ? value.length + i : i;

    if (resolved < 0 || resolved >= value.length) {
      throw new ErrorException(
        `@at: index ${i} out of bounds for length ${value.length}`,
      );
    }

    return value[resolved];
  },
});
