import { defineHelper, ErrorException, log2, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  constBigInt,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
} from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

export default defineHelper<MathModule>({
  name: "log2",
  description:
    "The base-2 logarithm of a whole number, rounded down — the position of its highest set bit, so it also gives a bit length. Undefined at zero.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "number",
      description: "Whole number above zero",
    },
  ],
  async run(_module, { value }) {
    return Num.fromBigInt(log2(Num(value).toBigInt()));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);
    if (o.cat === "Int") {
      throw new ErrorException("@log2! needs an unsigned operand");
    }
    if (o.kind === "const") {
      return {
        kind: "const",
        cat: "Uint",
        value: Num.fromBigInt(log2(constBigInt(o))),
      };
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.log2, [materializeWord(ctx, o)]),
      cat: "Uint",
    };
  },
});
