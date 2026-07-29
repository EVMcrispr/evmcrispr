import "../setup";
import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { evml, getDiagnostics } from "../../src";

function diagnostics(script: string) {
  return getDiagnostics(script);
}

describe("Core > diagnostics", () => {
  it("should return empty array for valid scripts", () => {
    const result = diagnostics("set $x 1\nset $y 2");
    expect(result).to.eql([]);
  });

  it("should return empty array for empty scripts", () => {
    const result = diagnostics("");
    expect(result).to.eql([]);
  });

  it("should return diagnostics for scripts with syntax errors", () => {
    const result = diagnostics("(");
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].severity).to.equal("error");
    expect(result[0].message).to.be.a("string");
  });

  it("should include line and column information", () => {
    const result = diagnostics("\n(");
    expect(result.length).to.be.greaterThan(0);
    expect(result[0].line).to.be.a("number");
    expect(result[0].col).to.be.a("number");
  });

  it("should handle completely broken input without throwing", () => {
    const result = diagnostics(")))((())?!@#$%");
    expect(result).to.be.an("array");
  });
});

describe("Core > EvmlScript.validate", () => {
  it("returns valid: true and no diagnostics for a clean script", async () => {
    const { diagnostics: ds, valid } = await evml
      .script("set $x 1\nset $y $x")
      .validate();
    expect(valid).to.equal(true);
    expect(ds).to.eql([]);
  });

  it("reports semantic errors and marks the script invalid", async () => {
    const { diagnostics: ds, valid } = await evml
      .script("print $undefined")
      .validate();
    expect(valid).to.equal(false);
    const semantic = ds.filter((d) => d.source === "semantic");
    expect(semantic.map((d) => d.code)).to.include("undefined-variable");
  });

  it("merges parse and semantic diagnostics ordered by position", async () => {
    // Line 1: a stray `)` → parse error. Line 2: undefined variable.
    const { diagnostics: ds } = await evml
      .script("set $x )\nprint $missing")
      .validate();
    const lines = ds.map((d) => d.line);
    expect(lines).to.deep.equal([...lines].sort((a, b) => a - b));
    expect(ds.some((d) => d.source === "parser")).to.equal(true);
    expect(ds.some((d) => d.source === "semantic")).to.equal(true);
  });

  it("stays valid when only warnings are present", async () => {
    // Use-before-set is a warning, not an error.
    const { valid, diagnostics: ds } = await evml
      .script("print $late\nset $late 1")
      .validate();
    expect(ds.some((d) => d.severity === "warning")).to.equal(true);
    expect(valid).to.equal(true);
  });
});
