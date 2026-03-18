import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.at",
  description: "Access a character by index in a string.",
  returnType: "string",
  args: [
    { name: "value", type: "string", description: "Input value" },
    { name: "index", type: "number", description: "Zero-based character index" },
  ],
  async run(_, { value, index }) {
    const str = String(value);
    const i = Num(index).toNumber();
    const resolved = i < 0 ? str.length + i : i;

    if (resolved < 0 || resolved >= str.length) {
      throw new ErrorException(
        `@str.at: index ${i} out of bounds for length ${str.length}`,
      );
    }

    return str[resolved];
  },
});
