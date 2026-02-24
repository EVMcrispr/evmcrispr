import { ErrorException, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "concat",
  description: "Concatenate strings or arrays together.",
  returnType: ["string", "array"],
  args: [
    { name: "first", type: ["string", "array"] },
    { name: "rest", type: ["string", "array"], rest: true },
  ],
  async run(_, { first, rest }) {
    const items = [first, ...rest];

    const hasArray = items.some((v: unknown) => Array.isArray(v));
    const hasScalar = items.some((v: unknown) => !Array.isArray(v));

    if (hasArray && hasScalar) {
      throw new ErrorException(
        "@concat cannot mix arrays and non-array values",
      );
    }

    if (hasArray) {
      return items.flat();
    }

    return items.join("");
  },
});
