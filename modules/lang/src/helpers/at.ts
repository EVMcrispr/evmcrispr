import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "at",
  description: "Access an element by index in an array.",
  returnType: "any",
  args: [
    { name: "value", type: "array", description: "Input value" },
    {
      name: "index",
      type: "number",
      description: "Zero-based index (negative counts from end)",
    },
  ],
  async run(_, { value, index }) {
    const i = Num(index).toNumber();
    const resolved = i < 0 ? value.length + i : i;

    if (resolved < 0 || resolved >= value.length) {
      throw new ErrorException(
        `@at: index ${i} out of bounds for length ${value.length}`,
      );
    }

    return value[resolved];
  },
});
