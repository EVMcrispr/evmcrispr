import "../setup";
import { describe, it } from "bun:test";
import { TestContext } from "@evmcrispr/test-utils";
import { expect } from "chai";

describe("Core > hover", () => {
  const ctx = new TestContext();

  describe("over std command names", () => {
    it("should return hover info for 'set'", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 1, col: 1 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("set");
    });

    it("should return hover info for 'load'", async () => {
      const script = "load aragonos --as ar";
      const result = await ctx.hover(script, { line: 1, col: 0 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("load");
    });
  });

  describe("over helpers", () => {
    it("should return hover info for @me", async () => {
      const script = "set $x @me";
      const result = await ctx.hover(script, { line: 1, col: 7 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("@me");
    });

    it("should return hover info for @token", async () => {
      const script = "set $x @token(DAI)";
      const result = await ctx.hover(script, { line: 1, col: 7 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("@token");
      expect(result!.contents).to.include("address");
    });
  });

  describe("over variables", () => {
    it("should return hover info for $variable", async () => {
      const script = "set $myVar 42\nset $other $myVar";
      const result = await ctx.hover(script, { line: 2, col: 11 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("$myVar");
      expect(result!.contents).to.include("variable");
    });

    it("should return variable hover even without a prior set definition", async () => {
      const script = "set $other $unknown";
      const result = await ctx.hover(script, { line: 1, col: 11 });
      expect(result).to.not.be.null;
      expect(result!.contents).to.include("$unknown");
      expect(result!.contents).to.include("variable");
    });
  });

  describe("edge cases", () => {
    it("should return null for whitespace", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 1, col: 50 });
      expect(result).to.be.null;
    });

    it("should return null for empty lines", async () => {
      const script = "set $x 1\n\nset $y 2";
      const result = await ctx.hover(script, { line: 2, col: 0 });
      expect(result).to.be.null;
    });

    it("should return null for lines beyond the script", async () => {
      const script = "set $x 1";
      const result = await ctx.hover(script, { line: 10, col: 0 });
      expect(result).to.be.null;
    });
  });
});
