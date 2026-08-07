import { ErrorException, fieldItem, Num } from "@evmcrispr/sdk";
import type { CalcOpName } from "../lib/combinators";
import { encodeCalc } from "../lib/combinators";
import type { Operand } from "../lib/compiler";
import {
  combinatorCall,
  compileOperand,
  constBigInt,
  materializeWord,
} from "../lib/compiler";
import { defineBangHelper } from "./_bang";

const WORD_MASK = (1n << 256n) - 1n;

const BITWISE_OPS: Record<string, CalcOpName> = {
  "&": "And",
  "|": "Or",
  "^": "Xor",
  "<<": "Shl",
  ">>": "Shr",
};

function foldBitwise(op: CalcOpName, l: bigint, r: bigint): bigint {
  const lw = l & WORD_MASK;
  const rw = r & WORD_MASK;
  switch (op) {
    case "And":
      return lw & rw;
    case "Or":
      return lw | rw;
    case "Xor":
      return lw ^ rw;
    case "Shl":
      return rw > 255n ? 0n : (lw << rw) & WORD_MASK;
    case "Shr":
      return rw > 255n ? 0n : lw >> rw;
    default:
      throw new ErrorException(`unsupported bitwise operator ${op}`);
  }
}

/** Word-typed operands only — dynamic values have no single word to
 *  operate on. */
function requireWord(o: Operand, helper: string): Operand {
  if (o.cat === "String" || o.cat === "Bytes") {
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
  completions: { op: () => Object.keys(BITWISE_OPS).map(fieldItem) },
  compileAssert: async (ctx, node) => {
    if (node.args.length === 1) {
      // Raw word cast: the value unchanged, recategorized as a number
      // (the explicit bool -> 0/1 bridge; also bytes32/address -> number).
      const o = requireWord(await compileOperand(ctx, node.args[0]), "bytes!");
      if (o.kind === "const") {
        const value = constBigInt(o) & WORD_MASK;
        return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
      }
      return { kind: "call", target: o.target, data: o.data, cat: "Uint" };
    }
    if (node.args.length !== 3) {
      throw new ErrorException(
        '@bytes! expects (value) or (a "op" b), e.g. @bytes!($token::flags() "&" 0xff)',
      );
    }
    const opStr = await ctx.interpreters.interpretNode(node.args[1]);
    const op = BITWISE_OPS[String(opStr)];
    if (!op) {
      throw new ErrorException(
        `@bytes! operator must be one of "&" "|" "^" "<<" ">>", got "${String(opStr)}"`,
      );
    }
    const l = requireWord(await compileOperand(ctx, node.args[0]), "bytes!");
    const r = requireWord(await compileOperand(ctx, node.args[2]), "bytes!");
    if (l.kind === "const" && r.kind === "const") {
      const value = foldBitwise(op, constBigInt(l), constBigInt(r));
      return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    return combinatorCall(
      ctx,
      encodeCalc(op, materializeWord(ctx, l), materializeWord(ctx, r)),
      "Uint",
    );
  },
});
