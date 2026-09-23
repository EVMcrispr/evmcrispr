import { describe, expect, it } from "bun:test";
import type { BlockExpressionNode } from "@evmcrispr/sdk";
import { parseScript } from "../../../src/parsers/script";

describe("smart block parsing", () => {
  it("marks smart blocks without changing ordinary AST shapes", () => {
    for (const marker of ["", "!"]) {
      const script = `batch ${marker}(\nif true (\nprint 1\n)\n)`;
      const result = parseScript(script);
      expect(result.errors).toEqual([]);
      const block = result.ast.body[0].args[0] as BlockExpressionNode;
      expect(block.smart).toBe(marker ? true : undefined);
      expect(Object.hasOwn(block, "smart")).toBe(!!marker);
      expect(block.loc?.start).toMatchObject({ line: 1, col: 6 });
      expect(block.loc?.end).toMatchObject({ line: 5, col: 1 });
      expect(
        (block.body[0].args[1] as BlockExpressionNode).smart,
      ).toBeUndefined();
    }
  });
  it("keeps smart blocks distinct from helper bangs", () => {
    const result = parseScript("batch !(\nset $x @calc!(1 + 2)\n)");
    expect(result.errors).toEqual([]);
    expect(
      (result.ast.body[0].args[0] as BlockExpressionNode).body[0].args[1],
    ).toMatchObject({ name: "calc!" });
  });
  it.each(["batch ! (\nprint 1\n)", "batch !(\nprint 1", "batch !("])(
    "rejects malformed or incomplete input: %s",
    (script) => {
      expect(parseScript(script).errors.length).toBeGreaterThan(0);
    },
  );
});
