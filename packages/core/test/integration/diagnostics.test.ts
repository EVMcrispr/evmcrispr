import "../setup";
import { describe, it } from "bun:test";
import { expect } from "chai";
import { EVMcrispr } from "../../src/EVMcrispr";

function diagnostics(script: string) {
  const evm = new EVMcrispr();
  return evm.getDiagnostics(script);
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
