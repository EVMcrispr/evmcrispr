import { ErrorException, Num } from "@evmcrispr/sdk";
import { numberToHex } from "viem";
import {
  compileOperand,
  constBigInt,
  materializeWord,
  notCombine,
  wordOpParam,
} from "../lib/compiler";
import { checkNot } from "../lib/composition";
import { rawParam, toWord } from "../lib/erc8211";
import { defineBangHelper } from "./_bang";

const WORD_MASK = (1n << 256n) - 1n;

export default defineBangHelper({
  name: "not!",
  description:
    "Negation computed on-chain, dispatched on the operand: logical not for booleans (stays a bool), bitwise complement of the raw 32-byte word for numbers and bytes32. Never a conversion — cast explicitly with @bytes!(x) first if needed.",
  returnType: "any",
  args: [
    {
      name: "value",
      type: "any",
      description: "Boolean (logical not) or number/bytes32 (bitwise not)",
    },
  ],
  compileAssert: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@not! expects a single operand, e.g. @not!($vault::paused())",
      );
    }
    const o = await compileOperand(ctx, node.args[0]);
    const check = checkNot(o.cat);
    if (!check.ok) throw new ErrorException(check.reason);
    if (o.cat === "Bool") {
      return notCombine(ctx, o);
    }
    if (o.kind === "const") {
      const value = ~constBigInt(o) & WORD_MASK;
      return o.cat === "Bytes32"
        ? {
            kind: "const",
            cat: "Bytes32",
            value: numberToHex(value, { size: 32 }),
          }
        : { kind: "const", cat: "Uint", value: Num.fromBigInt(value) };
    }
    // Bitwise NOT is bitXor against all-ones.
    return {
      kind: "call",
      param: wordOpParam(
        ctx,
        "bitXor",
        false,
        materializeWord(ctx, o),
        rawParam(toWord(WORD_MASK)),
      ),
      cat: check.result,
    };
  },
});
