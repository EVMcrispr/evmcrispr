import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "at",
  description: "Access an element by index in a string or array.",
  returnType: "any",
  args: [
    { name: "value", type: ["string", "array"] },
    { name: "index", type: "number" },
  ],
  async run(_, { value, index }) {
    const i = Number(Num.coerce(index).toBigInt());
    const len = Array.isArray(value) ? value.length : String(value).length;
    const resolved = i < 0 ? len + i : i;

    if (resolved < 0 || resolved >= len) {
      throw new ErrorException(
        `@at: index ${i} out of bounds for length ${len}`,
      );
    }

    if (Array.isArray(value)) {
      return value[resolved];
    }
    return String(value)[resolved];
  },
});
