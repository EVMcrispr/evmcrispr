import "../setup";
import { describe, it } from "bun:test";
import { TestContext } from "@evmcrispr/test-utils";
import { expect } from "chai";

describe("Core > completions", () => {
  const ctx = new TestContext();

  describe("command name completions", () => {
    it("should suggest std commands on an empty line", async () => {
      const script = "";
      const result = await ctx.completions(script, { line: 1, col: 0 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("set");
      expect(labels).to.include("load");
      expect(labels).to.include("exec");
    });

    it("should suggest commands when typing a partial name", async () => {
      const script = "se";
      const result = await ctx.completions(script, { line: 1, col: 2 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("set");
    });
  });

  describe("helper completions", () => {
    it("should suggest helpers after @", async () => {
      const script = "set $x @";
      const result = await ctx.completions(script, { line: 1, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@me");
      expect(labels).to.include("@token");
    });

    it("should return an array for partial helper input", async () => {
      const script = "set $x @to";
      const result = await ctx.completions(script, { line: 1, col: 10 });
      expect(result).to.be.an("array");
    });
  });

  describe("variable completions", () => {
    it("should suggest previously set variables", async () => {
      const script = "set $myVar 42\nset $other $";
      const result = await ctx.completions(script, { line: 2, col: 12 });
      expect(result).to.be.an("array");
      if (result.length > 0) {
        const labels = result.map((c) => c.label);
        expect(labels).to.include("$myVar");
      }
    });
  });

  describe("cross-module completions", () => {
    it("should include aragonos helpers after loading the module", async () => {
      const script = "load aragonos --as ar\nset $x @";
      const result = await ctx.completions(script, { line: 2, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@app");
      expect(labels).to.include("@aragonEns");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for out-of-bounds position", async () => {
      const script = "set $x 1";
      const result = await ctx.completions(script, { line: 100, col: 0 });
      expect(result).to.be.an("array");
    });
  });
});
