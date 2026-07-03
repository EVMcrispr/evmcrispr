import { describe, expect, it } from "bun:test";

import type { ArgDef, Node } from "../../src";
import { computeCommandArity, NodeType } from "../../src";

// Minimal arg nodes (only `type` matters to the arity computation).
const lit = (): Node => ({ type: NodeType.StringLiteral, value: "x" });
const block = (): Node => ({ type: NodeType.BlockExpression, body: [] }) as any;
const args = (...ns: Node[]): Node[] => ns;

describe("computeCommandArity", () => {
  it("requires an exact count for fixed args", () => {
    const defs: ArgDef[] = [
      { name: "a", type: "string" },
      { name: "b", type: "string" },
    ];
    expect(computeCommandArity(defs, args(lit())).isError).toBe(true);
    expect(computeCommandArity(defs, args(lit(), lit())).isError).toBe(false);
    expect(computeCommandArity(defs, args(lit(), lit(), lit())).isError).toBe(
      true,
    );
  });

  it("allows a range for optional args", () => {
    const defs: ArgDef[] = [
      { name: "a", type: "string" },
      { name: "b", type: "string", optional: true },
    ];
    expect(computeCommandArity(defs, args(lit())).isError).toBe(false);
    expect(computeCommandArity(defs, args(lit(), lit())).isError).toBe(false);
    expect(computeCommandArity(defs, args()).isError).toBe(true);
  });

  it("allows any count at or above the minimum for rest args", () => {
    const defs: ArgDef[] = [
      { name: "a", type: "string" },
      { name: "rest", type: "string", rest: true },
    ];
    expect(computeCommandArity(defs, args()).isError).toBe(true);
    expect(computeCommandArity(defs, args(lit())).isError).toBe(false);
    expect(
      computeCommandArity(defs, args(lit(), lit(), lit(), lit())).isError,
    ).toBe(false);
  });

  it("extracts a trailing block and reports a missing required block", () => {
    const defs: ArgDef[] = [
      { name: "cond", type: "bool" },
      { name: "body", type: "block" },
    ];
    const withBlock = computeCommandArity(defs, args(lit(), block()));
    expect(withBlock.isError).toBe(false);
    expect(withBlock.blockNodes[0]).toBeDefined();
    expect(withBlock.effectiveArgCount).toBe(1);

    const missing = computeCommandArity(defs, args(lit()));
    expect(missing.missingBlockName).toBe("body");
  });

  it("treats a union block that received no block as a regular arg", () => {
    // `def`-style: `<name> <params> <body:[expression, block]>`
    const defs: ArgDef[] = [
      { name: "name", type: "string" },
      { name: "body", type: ["expression", "block"] },
    ];
    const asExpr = computeCommandArity(defs, args(lit(), lit()));
    expect(asExpr.useFullDefs).toBe(true);
    expect(asExpr.isError).toBe(false);

    const asBlock = computeCommandArity(defs, args(lit(), block()));
    expect(asBlock.useFullDefs).toBe(false);
    expect(asBlock.isError).toBe(false);
  });
});
