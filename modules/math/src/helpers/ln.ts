import {
  checkedRange,
  defineHelper,
  ErrorException,
  INT256_MAX,
  lnWad,
  Num,
} from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  CONSTRAINT_TYPE,
  compileOperand,
  constBigInt,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

export default defineHelper<MathModule>({
  name: "ln",
  description:
    "The natural logarithm of a wad-scaled value, in wad (1e18) fixed point. The inverse of exp: it turns a growth factor back into the rate that produced it.",
  compileDescription:
    "Accepts live values and carries the result’s wad scale for surrounding arithmetic.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "number",
      description: "Wad-scaled value, strictly above zero",
    },
  ],
  async run(_module, { value }) {
    const integer = Num(value).toBigInt();
    checkedRange(integer, true);
    return Num.fromBigInt(lnWad(integer));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);
    if (o.cat !== "Int" && o.cat !== "Uint")
      throw new ErrorException("@ln! requires a numeric operand");
    if (o.kind === "const" && constBigInt(o) <= 0n) {
      throw new ErrorException("@ln! is undefined at or below zero");
    }

    if (o.kind === "const") {
      checkedRange(constBigInt(o), true);
      return {
        kind: "const",
        cat: "Int",
        value: Num.fromBigInt(lnWad(constBigInt(o))),
        scale: 18,
      };
    }
    const param = materializeWord(ctx, o);
    const signedParam =
      o.cat === "Uint"
        ? {
            ...param,
            constraints: [
              ...param.constraints,
              {
                constraintType: CONSTRAINT_TYPE.Lte,
                referenceData: toWord(INT256_MAX),
              },
            ],
          }
        : param;
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.lnWad, [signedParam]),
      cat: "Int",
      scale: 18,
    };
  },
});
