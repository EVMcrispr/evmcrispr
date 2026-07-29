import { describe, expect, it } from "bun:test";
import { registerAllModules } from "../../src/lib/modules.js";
import { validateEvml } from "../../src/tools/validate-evml.js";

registerAllModules();

describe("validateEvml", () => {
  it("returns valid for a correct script", async () => {
    const result = await validateEvml(
      "set $dao 0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.symbols.length).toBeGreaterThan(0);
  });

  it("returns symbols for set command", async () => {
    const result = await validateEvml("set $x 42");
    expect(result.valid).toBe(true);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].kind).toBe("variable");
  });

  it("returns symbols for load command", async () => {
    const result = await validateEvml("load aragonos");
    expect(result.valid).toBe(true);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].kind).toBe("command");
  });

  it("handles multi-line scripts", async () => {
    const script = `set $x 42
set $y 100
load aragonos`;
    const result = await validateEvml(script);
    expect(result.valid).toBe(true);
    expect(result.symbols).toHaveLength(3);
  });

  it("reports diagnostics for unmatched paren", async () => {
    const result = await validateEvml("(");
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("reports diagnostics for unknown command", async () => {
    const result = await validateEvml("unknown_cmd foo");
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("returns valid for an empty script", async () => {
    const result = await validateEvml("");
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
