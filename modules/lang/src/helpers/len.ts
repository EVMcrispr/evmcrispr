import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  compileOnchainHelper,
  encodeNav,
  formatParamType,
  isBangHelperNode,
  lenParam,
  staticCallParam,
  typedArrayArg,
  wordCountParam,
} from "@evmcrispr/sdk/onchain";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "len",
  description:
    "Length of a value: element count for an array, byte length for a string or bytes.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "array",
      description: "Source array, string or bytes value",
    },
  ],
  async run(_, { value }) {
    return Num(BigInt(value.length));
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException("@len! expects a single call argument");
    }
    if (node.args[0] && isBangHelperNode(node.args[0])) {
      const operand = await compileOnchainHelper(ctx, node.args[0]);
      if (
        operand.kind === "call" &&
        operand.collection?.transport === "words" &&
        !operand.collection.lanes
      )
        return {
          kind: "call",
          cat: "Uint",
          param: wordCountParam(ctx, operand.param),
        };
      const array = await typedArrayArg(ctx, node.args[0], "len!");
      return {
        kind: "call",
        param: staticCallParam(
          ctx.core,
          encodeNav(array.param, `(${formatParamType(array.element)}[])`, [
            0n,
            -(1n << 255n),
          ]),
        ),
        cat: "Uint",
      };
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
