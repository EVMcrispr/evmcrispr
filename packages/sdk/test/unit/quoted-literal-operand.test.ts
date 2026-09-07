import { describe, expect, it } from "bun:test";
import { NodeType } from "../../src";
import { compileOperand, constOperand } from "../../src/onchain/compile";
import type { CompileCtx } from "../../src/onchain/types";

/** A quoted literal that looks numeric is still a string: the decimal
 *  strings @num.format! produces compare against `"1.5"`, not 1.5. */
const ctx = {
  interpreters: {
    interpretNode: async (n: any) => n?.value,
    interpretNodes: async (ns: any[]) => ns.map((n) => n?.value),
  },
} as unknown as CompileCtx;

describe("quoted numeric literals", () => {
  it("keeps a string literal node a String operand", async () => {
    const o = await compileOperand(ctx, {
      type: NodeType.StringLiteral,
      value: "1.5",
    } as any);
    expect(o).toEqual({ kind: "const", cat: "String", value: "1.5" });
  });

  it("still coerces a bare numeric string", () => {
    expect(constOperand("1.5").cat).toBe("Uint");
    expect(constOperand("-2").cat).toBe("Int");
  });

  it("still classifies quoted addresses and hex", () => {
    expect(
      constOperand("0x6B175474E89094C44Da98b954EedeAC495271d0F", {
        quoted: true,
      }).cat,
    ).toBe("Address");
    expect(constOperand("0xabcd", { quoted: true }).cat).toBe("Bytes");
  });
});
