import { describe, expect, it } from "bun:test";
import { findHeredocRanges, heredocKindClass } from "../../src/heredocRanges";

describe("findHeredocRanges", () => {
  it("returns fence-inclusive 1-based line ranges", () => {
    const script = [
      "set $x <<<SOL",
      "pragma solidity 0.8.26;",
      "contract A {}",
      "SOL",
      "exec $x",
    ].join("\n");
    expect(findHeredocRanges(script)).toEqual([
      { startLine: 1, endLine: 4, sentinel: "SOL", openCol: 8 },
    ]);
  });

  it("handles several blocks, trailing text on the closing line, and unknown sentinels", () => {
    const script = [
      "set $a <<<CIRCOM",
      "template T() {}",
      "CIRCOM",
      "",
      "set $b @f(<<<TXT",
      "hello",
      "TXT)",
    ].join("\n");
    expect(findHeredocRanges(script)).toEqual([
      { startLine: 1, endLine: 3, sentinel: "CIRCOM", openCol: 8 },
      { startLine: 5, endLine: 7, sentinel: "TXT", openCol: 11 },
    ]);
  });

  it("does not close on a longer word sharing the sentinel prefix", () => {
    const script = ["set $a <<<SOL", "SOLIDITY", "SOL"].join("\n");
    expect(findHeredocRanges(script)).toEqual([
      { startLine: 1, endLine: 3, sentinel: "SOL", openCol: 8 },
    ]);
  });

  it("runs an unterminated block to the end of the script", () => {
    const script = ["set $a <<<NOIR", "fn main() {}", ""].join("\n");
    expect(findHeredocRanges(script)).toEqual([
      { startLine: 1, endLine: 3, sentinel: "NOIR", openCol: 8 },
    ]);
  });

  it("ignores <<< inside comments and lowercase sentinels", () => {
    expect(findHeredocRanges("# <<<SOL\nset $a <<<sol\nx")).toEqual([]);
  });
});

describe("heredocKindClass", () => {
  it("maps sentinels to a stable class, falling back for unknown kinds", () => {
    expect(heredocKindClass("SOL")).toBe("heredoc-sol");
    expect(heredocKindClass("CIRCOM")).toBe("heredoc-circom");
    expect(heredocKindClass("TXT")).toBe("heredoc-other");
  });
});
