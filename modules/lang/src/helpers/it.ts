import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { elementOperand } from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "it",
  description: "The current fold/map/filter element.",
  compileDescription:
    "Names the lambda element again alongside the prepend, so an expression can use it more than once (e.g. `@num!(* @it!)` squares).",
  returnType: "any",
  args: [],
  compile: async (ctx, node) => {
    if (node.args.length !== 0) {
      throw new ErrorException("@it! takes no arguments");
    }
    if (ctx.lambdaElemCat === undefined) {
      throw new ErrorException(
        "@it! is only valid inside a fold/map/filter lambda — it names the element the lambda is applied to",
      );
    }
    return elementOperand(ctx.lambdaElemCat);
  },
});
