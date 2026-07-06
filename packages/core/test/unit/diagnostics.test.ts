import "../setup";

import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import { getDiagnostics, parseDiagnosticString } from "../../src";

describe("Core > parseDiagnosticString", () => {
  it("parses the single-position format", () => {
    const d = parseDiagnosticString("CommandParserError(3:5): boom");
    expect(d).to.deep.equal({
      line: 3,
      col: 5,
      message: "boom",
      severity: "error",
      code: "command-parser",
      source: "parser",
    });
  });

  it("parses the two-position (range) format", () => {
    const d = parseDiagnosticString("BlockParserError(2:0,4:1): unterminated");
    expect(d).to.deep.equal({
      line: 2,
      col: 0,
      endLine: 4,
      endCol: 1,
      message: "unterminated",
      severity: "error",
      code: "block-parser",
      source: "parser",
    });
  });

  it("derives a kebab-case code from the error type", () => {
    expect(
      parseDiagnosticString("HexadecimalParserError(1:0): x")?.code,
    ).to.equal("hexadecimal-parser");
  });

  it("returns null for a non-diagnostic string", () => {
    expect(parseDiagnosticString("not a diagnostic")).to.equal(null);
    expect(parseDiagnosticString("")).to.equal(null);
  });
});

describe("Core > getDiagnostics", () => {
  it("surfaces an invalid-expression error as a marker (regression)", () => {
    // Historically these were emitted with a comma instead of a colon
    // (`ExpressionParserError(1,5): ...`), so `parseDiagnosticString` dropped
    // them and no marker ever reached the editor.
    const ds = getDiagnostics("set $x )");
    expect(ds.length).to.be.greaterThan(0);
    const expr = ds.find((d) => d.code === "expression-parser");
    expect(expr, JSON.stringify(ds)).to.exist;
    expect(expr!.message).to.match(/Expected a value/);
    expect(expr!.line).to.equal(1);
    expect(expr!.col).to.equal(7);
  });

  it("reports 1-indexed line and 0-indexed column for a bad literal", () => {
    // `bad@` on line 2: the identifier parser rejects it.
    const ds = getDiagnostics("set $x 1\nset $y @");
    expect(ds.length).to.be.greaterThan(0);
    expect(ds[0].line).to.equal(2);
    expect(ds[0].col).to.be.a("number");
    expect(ds[0].source).to.equal("parser");
  });

  it("never throws on broken input", () => {
    expect(getDiagnostics(")))((())?!@#$%")).to.be.an("array");
  });

  describe("comma hint", () => {
    it("hints when helper arguments are comma-separated", () => {
      const ds = getDiagnostics("set $x @token.balance(DAI, @me)");
      expect(ds.length).to.be.greaterThan(0);
      expect(
        ds.some((d) => /space-separated/.test(d.message)),
        JSON.stringify(ds),
      ).to.equal(true);
    });

    it("hints when array elements are comma-separated", () => {
      const ds = getDiagnostics('set $x ["a", "b"]');
      expect(
        ds.some((d) => /space-separated/.test(d.message)),
        JSON.stringify(ds),
      ).to.equal(true);
    });

    it("does not hint on comma-free parse errors", () => {
      const ds = getDiagnostics("set $x )");
      expect(ds.some((d) => /space-separated/.test(d.message))).to.equal(false);
    });

    it("does not flag commas inside ABI signatures", () => {
      // Commas inside signature barewords are valid Solidity syntax.
      const ds = getDiagnostics(
        "exec 0x44fA8E6f47987339850636F88629646662444217 transfer(address,uint256) @me 1",
      );
      expect(ds).to.deep.equal([]);
    });
  });
});
