import { defineHelper, ErrorException, Num, rpow } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  constBigInt,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
  rawParam,
  scaleOf,
  toWord,
} from "@evmcrispr/sdk/onchain";
import type MathModule from "..";

const WAD = 10n ** 18n;

/** The decimal places a power-of-ten unit stands for, or undefined when
 *  the unit is not a power of ten. */
function scaleOfBase(base: bigint): number | undefined {
  let s = 0;
  let v = base;
  while (v > 1n && v % 10n === 0n) {
    v /= 10n;
    s += 1;
  }
  return v === 1n ? s : undefined;
}

export default defineHelper<MathModule>({
  name: "pow",
  description:
    "Raise a fixed-point value to a whole power, where one unit is `base` (1e18 by default, 1e27 for a ray). Compounding a per-period rate over N periods is pow(unit + rate, N).",
  compileDescription:
    "A value carrying a scale other than a wad must state its unit, since the plain face cannot see a scale and would compound at 1e18.",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "number",
      description: "The fixed-point value to raise",
    },
    { name: "exponent", type: "number", description: "Whole exponent" },
    {
      name: "base",
      type: "number",
      optional: true,
      description: "One unit of the value, e.g. 1e18 or 1e27 (default: 1e18)",
    },
  ],
  async run(_module, { value, exponent, base }) {
    const b = base === undefined ? WAD : Num(base).toBigInt();
    return Num.fromBigInt(
      rpow(Num(value).toBigInt(), Num(exponent).toBigInt(), b),
    );
  },
  compile: async (ctx, node): Promise<Operand> => {
    const value = await compileOperand(ctx, node.args[0]);
    const exponent = await compileOperand(ctx, node.args[1]);
    if (value.cat === "Int" || exponent.cat === "Int") {
      throw new ErrorException("@pow! needs unsigned operands");
    }
    // The unit falls out of the value's own scale when it has one, so a
    // ray-scaled rate does not have to restate 1e27 at the call site.
    const scale = scaleOf(value);
    let base: bigint;
    if (node.args[2] !== undefined) {
      const given = await compileOperand(ctx, node.args[2]);
      if (given.kind !== "const") {
        throw new ErrorException(
          "@pow! resolves its base at composition time — pass a literal unit like 1e18 or 1e27",
        );
      }
      base = constBigInt(given);
    } else if (scale && scale !== 18) {
      // Taking the unit from the operand's scale is convenient but silently
      // divergent: a Num carries no scale, so the plain @pow cannot see it and
      // always uses a wad. Two faces of one expression would then compound at
      // different units and disagree by orders of magnitude. Refusing is the
      // only spelling that cannot quietly be wrong; a wad-scaled operand still
      // needs no argument, because that is the default on both sides.
      throw new ErrorException(
        `@pow! would take its unit from the value's own scale (1e${scale}), which the plain @pow cannot see — it always uses 1e18, so the two faces would compute different numbers. Pass the unit: @pow!(value exponent 1e${scale})`,
      );
    } else {
      base = WAD;
    }
    if (base <= 0n) {
      throw new ErrorException("@pow! needs a positive base");
    }
    const resultScale = scaleOfBase(base);

    if (value.kind === "const" && exponent.kind === "const") {
      return {
        kind: "const",
        cat: "Uint",
        value: Num.fromBigInt(
          rpow(constBigInt(value), constBigInt(exponent), base),
        ),
        ...(resultScale ? { scale: resultScale } : {}),
      };
    }
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.rpow, [
        materializeWord(ctx, value),
        materializeWord(ctx, exponent),
        rawParam(toWord(base)),
      ]),
      cat: "Uint",
      ...(resultScale ? { scale: resultScale } : {}),
    };
  },
});
