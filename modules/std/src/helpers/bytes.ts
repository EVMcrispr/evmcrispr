import {
  defineHelper,
  ErrorException,
  fieldItem,
  isHexString,
  isNum,
  Num,
} from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  BITWISE_FN,
  compileOperand,
  constBigInt,
  isWordCat,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import { toHex } from "viem";
import type Std from "..";

function toBytes(v: unknown): string {
  if (v instanceof Num) {
    if (!v.isInteger()) throw new ErrorException("Operand must be an integer");
    return toHex(v.toBigInt());
  }
  if (typeof v === "bigint") return toHex(v);
  if (typeof v === "string") {
    if (isHexString(v)) return v;
    return toHex(v);
  }
  if (isNum(v)) return toHex(Num(v).toBigInt());
  throw new ErrorException("Cannot convert value to bytes");
}

function bitwiseOp(left: bigint, op: string, right: bigint): bigint {
  switch (op) {
    case "&":
      return left & right;
    case "|":
      return left | right;
    // Spelled `xor` rather than `^`, matching @num, where `^` is
    // exponentiation. It was on-chain only until now, so the same expression
    // compiled and then would not run.
    case "xor":
      return left ^ right;
    case "<<":
      return left << right;
    case ">>":
      return left >> right;
    default:
      throw new ErrorException(`Operator ${op} not recognized`);
  }
}

// --- On-chain face (@bytes!) -----------------------------------------

const WORD_MASK = (1n << 256n) - 1n;

/** Word-width constant fold for the on-chain face — operands are the raw
 *  32-byte words, shifts in bits (past 255 a shift zeroes out). */
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

export default defineHelper<Std>({
  name: "bytes",
  description:
    "Convert a value to hex bytes, force UTF-8 encoding, or perform a bitwise operation.",
  compileDescription:
    "Bitwise operations run over the raw 32-byte words (shifts in bits, `>>` arithmetic on a signed value); with one argument it is the raw word cast.",
  returnType: "bytes",
  args: [
    { name: "a", type: "any", description: "Value to convert or left operand" },
    {
      name: "b",
      type: "string",
      description: "Operator (`&` `|` `<<` `>>`) or `utf8`",
      optional: true,
    },
    {
      name: "c",
      type: "any",
      description: "Right operand for bitwise ops",
      optional: true,
    },
  ],
  completions: {
    b: () => ["&", "|", "xor", "<<", ">>", "utf8"].map(fieldItem),
  },
  async run(_, { a, b, c }) {
    if (b === undefined) return toBytes(a);
    if (b === "utf8") return toHex(String(a));
    if (c !== undefined) {
      const l = BigInt(toBytes(a));
      const r = BigInt(toBytes(c));
      return toHex(bitwiseOp(l, b, r));
    }
    throw new ErrorException(
      "@bytes expects 1 arg (conversion), 2 with utf8, or 3 (bitwise)",
    );
  },
  compile: async (ctx, node) => {
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
        `@bytes! operator must be one of "&" "|" "xor" "<<" ">>", got "${String(opStr)}"`,
      );
    }
    const l = requireWord(await compileOperand(ctx, node.args[0]), "bytes!");
    const r = requireWord(await compileOperand(ctx, node.args[2]), "bytes!");
    // Signedness rides on the left operand, like everywhere else: `>>` on
    // an Int value is the arithmetic shift (EVM SAR, the sign fills in
    // from the left). `<<` has no sign semantics.
    const signedShr = fn === "shr" && l.cat === "Int";
    if (l.kind === "const" && r.kind === "const") {
      if (signedShr) {
        const bits = constBigInt(r) & WORD_MASK;
        const lv = constBigInt(l);
        // bigint >> is arithmetic; past 255 the sign fills everything
        const value = bits > 255n ? (lv < 0n ? -1n : 0n) : lv >> bits;
        return {
          kind: "const",
          cat: value < 0n ? "Int" : "Uint",
          value: Num.fromBigInt(value),
        };
      }
      const value = foldBitwise(fn, constBigInt(l), constBigInt(r));
      return { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    if (signedShr) {
      return {
        kind: "call",
        param: opReadParam(ctx, OP_SELECTORS.shrInt, [
          materializeWord(ctx, l),
          materializeWord(ctx, r),
        ]),
        cat: "Int",
      };
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
