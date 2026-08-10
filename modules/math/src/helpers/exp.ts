import { defineHelper, expWad, Num } from "@evmcrispr/sdk";
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
  name: "exp",
  description:
    "e raised to a wad-scaled power, in wad (1e18) fixed point. Continuous growth over a period: a rate r compounded continuously multiplies a balance by exp(r).",
  returnType: "number",
  args: [
    {
      name: "exponent",
      type: "number",
      description: "Wad-scaled exponent, e.g. 0.05e18",
    },
  ],
  async run(_module, { exponent }) {
    return Num.fromBigInt(expWad(Num(exponent).toBigInt()));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);

    if (o.kind === "const") {
      return {
        kind: "const",
        cat: "Int",
        value: Num.fromBigInt(expWad(constBigInt(o))),
        scale: 18,
      };
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.expWad, [materializeWord(ctx, o)]),
      cat: "Int",
      scale: 18,
    };
  },
});
