import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { concatArrayOperand, typedArrayParts } from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "concat",
  description: "Concatenate arrays together.",
  compileDescription:
    "Live parts remain unresolved until execution; each input is resolved once when the calldata is assembled.",
  returnType: "array",
  args: [
    {
      name: "first",
      type: "array",
      description: "First array to concatenate",
    },
    {
      name: "rest",
      type: "array",
      description: "Additional arrays to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].flat();
  },
  compile: async (ctx, node) => {
    if (node.args.length < 2) {
      throw new ErrorException(
        "@concat! expects at least two array parts, e.g. @concat!($safe::getOwners() [1 2])",
      );
    }
    return concatArrayOperand(
      ctx,
      await typedArrayParts(ctx, node.args, "concat!"),
      "concat!",
    );
  },
});
