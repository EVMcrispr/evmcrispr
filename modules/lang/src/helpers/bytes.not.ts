import { defineHelper, ErrorException, isHexString } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  constBigInt,
  materializeWord,
  rawParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import { toHex } from "viem";
import type Lang from "..";

const UINT256_MAX = 2n ** 256n - 1n;

export default defineHelper<Lang>({
  name: "bytes.not",
  description: "Bitwise NOT of a bytes value (256-bit complement).",
  returnType: "bytes",
  args: [{ name: "value", type: "bytes", description: "Input value" }],
  async run(_, { value }) {
    if (typeof value !== "string" || !isHexString(value)) {
      throw new ErrorException("@bytes.not expects a hex bytes value");
    }
    return toHex(UINT256_MAX ^ BigInt(value));
  },
  compile: async (ctx, node): Promise<Operand> => {
    const o = await compileOperand(ctx, node.args[0]);
    if (o.kind === "call" && (o.cat === "String" || o.cat === "Bytes")) {
      throw new ErrorException(
        "@bytes.not! complements a single word — a dynamic bytes value has no fixed width to complement",
      );
    }
    // There is no NOT opcode in the operator set, and none is needed:
    // complementing is xor against the all-ones word.
    const all = rawParam(toWord(UINT256_MAX));
    if (o.kind === "const") {
      return {
        kind: "const",
        cat: "Bytes32",
        value: toHex(UINT256_MAX ^ constBigInt(o), { size: 32 }),
      };
    }
    return {
      kind: "call",
      param: wordOpParam(ctx, "bitXor", false, materializeWord(ctx, o), all),
      cat: "Bytes32",
    };
  },
});
