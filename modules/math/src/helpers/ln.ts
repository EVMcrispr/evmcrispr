import { defineHelper, ErrorException, lnWad, Num } from "@evmcrispr/sdk";
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
  name: "ln",
  description:
    "The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it.",
  compileDescription:
    "The result carries its wad scale, so surrounding arithmetic aligns to it; the plain face hands back the raw wad integer.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "number",
      description: "Wad-scaled value, strictly above zero",
    },
  ],
  async run(_module, { value }) {
    return Num.fromBigInt(lnWad(Num(value).toBigInt()));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);
    if (o.kind === "const" && constBigInt(o) <= 0n) {
      throw new ErrorException("@ln! is undefined at or below zero");
    }

    if (o.kind === "const") {
      return {
        kind: "const",
        cat: "Int",
        value: Num.fromBigInt(lnWad(constBigInt(o))),
        scale: 18,
      };
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.lnWad, [materializeWord(ctx, o)]),
      cat: "Int",
      scale: 18,
    };
  },
});
