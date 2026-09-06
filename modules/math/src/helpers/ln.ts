import { defineHelper, ErrorException, lnWad, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { compileOperand, constBigInt } from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

export default defineHelper<MathModule>({
  name: "ln",
  description:
    "The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it.",
  compileDescription:
    "Accepts only values known before execution and carries the result’s wad scale for surrounding arithmetic.",
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
    throw new ErrorException(
      "@ln! requires a value known before execution; live operands are unsupported",
    );
  },
});
