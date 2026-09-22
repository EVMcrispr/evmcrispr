import {
  checkedRange,
  defineHelper,
  ErrorException,
  expWad,
  INT256_MAX,
  Num,
} from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  constBigInt,
  constraint,
  constrainWord,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
} from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

export default defineHelper<MathModule>({
  name: "exp",
  description:
    "e raised to a wad-scaled power, in wad (1e18) fixed point. Continuous growth over a period: a rate r compounded continuously multiplies a balance by exp(r).",
  compileDescription:
    "Accepts live values and carries the result’s wad scale for surrounding arithmetic.",
  returnType: "number",
  args: [
    {
      name: "exponent",
      type: "number",
      description: "Wad-scaled exponent, e.g. 0.05e18",
    },
  ],
  async run(_module, { exponent }) {
    const integer = Num(exponent).toBigInt();
    checkedRange(integer, true);
    return Num.fromBigInt(expWad(integer));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);
    if (o.cat !== "Int" && o.cat !== "Uint")
      throw new ErrorException("@exp! requires a numeric operand");

    if (o.kind === "const") {
      checkedRange(constBigInt(o), true);
      return {
        kind: "const",
        cat: "Int",
        value: Num.fromBigInt(expWad(constBigInt(o))),
        scale: 18,
      };
    }
    const param = materializeWord(ctx, o);
    const signedParam =
      o.cat === "Uint"
        ? constrainWord(ctx, param, constraint("Lte", INT256_MAX))
        : param;
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.expWad, [signedParam]),
      cat: "Int",
      scale: 18,
    };
  },
});
