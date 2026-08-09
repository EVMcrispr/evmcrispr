import { ErrorException, fieldItem, Num } from "@evmcrispr/sdk";
import type { Operand } from "../lib/compiler";
import {
  compileOperand,
  constBigInt,
  materializeWord,
  wordOpParam,
} from "../lib/compiler";
import { BITWISE_FN, isWordCat } from "../lib/composition";
import { defineBangHelper } from "./_bang";

const WORD_MASK = (1n << 256n) - 1n;

function foldBitwise(fn: string, l: bigint, r: bigint): bigint {
  const lw = l & WORD_MASK;
  const rw = r & WORD_MASK;
  switch (fn) {
    case "bitAnd":
      return lw & rw;
    case "bitOr":
      return lw | rw;
    case "bitXor":
      return lw ^ rw;
    case "shl":
      return rw > 255n ? 0n : (lw << rw) & WORD_MASK;
    case "shr":
      return rw > 255n ? 0n : lw >> rw;
    default:
      throw new ErrorException(`unsupported bitwise operator ${fn}`);
  }
}

/** Word-typed operands only (composition-table predicate) — dynamic
 *  values have no single word to operate on. */
function requireWord(o: Operand, helper: string): Operand {
  if (!isWordCat(o.cat)) {
    throw new ErrorException(
      `@${helper} needs 32-byte word operands (numbers, bool, address, bytes32), got a ${o.cat} value`,
    );
  }
  return o;
}

export default defineBangHelper({
  name: "bytes!",
  description:
    "Bitwise word operations computed on-chain (`&` `|` `^` `<<` `>>`), or with a single argument the raw 32-byte word cast (e.g. bool as 0/1). Word-width semantics: operands are the raw 32-byte words; shifts are in bits.",
  returnType: "number",
  args: [
    {
      name: "a",
      type: "any",
      description: "Left operand, or the sole value to cast to its raw word",
    },
    {
      name: "op",
      type: "string",
      description: "Bitwise operator: `&` `|` `^` `<<` `>>`",
      optional: true,
    },
    {
      name: "b",
      type: "any",
      description: "Right operand (shift amount in bits for `<<`/`>>`)",
      optional: true,
    },
  ],
  completions: { op: () => Object.keys(BITWISE_FN).map(fieldItem) },
  compileAssert: async (ctx, node) => {
    if (node.args.length === 1) {
      // Raw word cast: the value unchanged, recategorized as a number
      // (the explicit bool -> 0/1 bridge; also bytes32/address -> number).
      const o = requireWord(await compileOperand(ctx, node.args[0]), "bytes!");
      if (o.kind === "const") {
        const value = constBigInt(o) & WORD_MASK;
        return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
      }
      return { kind: "call", param: o.param, cat: "Uint" };
    }
    if (node.args.length !== 3) {
      throw new ErrorException(
        '@bytes! expects (value) or (a "op" b), e.g. @bytes!($token::flags() "&" 0xff)',
      );
    }
    const opStr = await ctx.interpreters.interpretNode(node.args[1]);
    const fn = BITWISE_FN[String(opStr)];
    if (!fn) {
      throw new ErrorException(
        `@bytes! operator must be one of "&" "|" "^" "<<" ">>", got "${String(opStr)}"`,
      );
    }
    const l = requireWord(await compileOperand(ctx, node.args[0]), "bytes!");
    const r = requireWord(await compileOperand(ctx, node.args[2]), "bytes!");
    if (l.kind === "const" && r.kind === "const") {
      const value = foldBitwise(fn, constBigInt(l), constBigInt(r));
      return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    return {
      kind: "call",
      param: wordOpParam(
        ctx,
        fn,
        false,
        materializeWord(ctx, l),
        materializeWord(ctx, r),
      ),
      cat: "Uint",
    };
  },
});
