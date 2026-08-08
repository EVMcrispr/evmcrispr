import { ErrorException } from "@evmcrispr/sdk";
import { chainArgWithLens, lenParam } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "len!",
  description:
    "The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "address",
      description:
        "A `::` call expression (or chain) returning an array, string or bytes",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@len! expects a single call argument");
    }
    const arg = await chainArgWithLens(ctx, "len!", node.args[0]);

    // With a lens, chainArgWithLens has already resolved the path to a
    // dynamic terminal; without one, the call must return a single dynamic
    // value the LEN sentinel can measure.
    let path = arg.path;
    if (!path) {
      if (arg.outputs.length !== 1) {
        throw new ErrorException(
          "@len! needs a single return value; select one with a lens",
        );
      }
      const t = arg.outputs[0].type;
      if (!/\[\]$/.test(t) && t !== "string" && t !== "bytes") {
        throw new ErrorException(
          `@len! needs a dynamic return value (array, string or bytes), got ${t}`,
        );
      }
      path = [0];
    }
    return {
      kind: "call",
      param: lenParam(ctx, arg.param, arg.outputs, path),
      cat: "Uint",
    };
  },
});
