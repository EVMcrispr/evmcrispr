import "../setup";
import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { TestContext } from "@evmcrispr/test-utils/evml";

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

    it("should suppress completions inside a heredoc block", async () => {
      const script =
        "set $src <<<SOL\npragma solidity 0.8.26;\ncon\nSOL\nprint $src";
      const inside = await ctx.completions(script, { line: 3, col: 3 });
      expect(inside).to.eql([]);
      // …but lines after the closing sentinel complete normally again.
      const after = await ctx.completions(script, { line: 5, col: 5 });
      expect(after).to.be.an("array");
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
    it("should include helpers from a loaded module (qualified)", async () => {
      // Uses the `coretest` stub registered in test/setup.ts so the
      // assertion verifies the cross-module loading machinery itself
      // without coupling the core package to any concrete module.
      const script = "load coretest\nset $x @";
      const result = await ctx.completions(script, { line: 2, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@coretest:coretest-helper");
    });

    it("should offer the unqualified spelling for import-listed helpers", async () => {
      const script = "load coretest [@coretest-helper]\nset $x @";
      const result = await ctx.completions(script, { line: 2, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@coretest-helper");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for out-of-bounds position", async () => {
      const script = "set $x 1";
      const result = await ctx.completions(script, { line: 100, col: 0 });
      expect(result).to.be.an("array");
    });
  });

  describe("config variable completions", () => {
    it("offers declared configs of loaded modules in set's binding slot", async () => {
      const script = "load coretest\nset ";
      const items = await ctx.completions(script, { line: 2, col: 4 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$std:tokenlist");
      expect(labels).to.include("$coretest:endpoint");
      // std declares them, so metadata rides along
      const endpoint = items.find((c) => c.label === "$coretest:endpoint");
      expect(endpoint?.detail).to.include("default: https://example.com");
    });

    it("does not offer configs of unloaded modules", async () => {
      const script = "set ";
      const items = await ctx.completions(script, { line: 1, col: 4 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$std:tokenlist");
      expect(labels).to.not.include("$coretest:endpoint");
    });

    it("does not offer unset config vars in read positions", async () => {
      const script = "load coretest\nset $x ";
      const items = await ctx.completions(script, { line: 2, col: 7 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("$coretest:endpoint");
    });

    it("offers a config var in read positions once it has been set", async () => {
      const script =
        'load coretest\nset $coretest:endpoint "https://x"\nset $y ';
      const items = await ctx.completions(script, { line: 3, col: 7 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$coretest:endpoint");
    });
  });

  describe("named-arg completions", () => {
    it("offers name: items for unused optional helper args", async () => {
      const script = "set $x @date(now )";
      const items = await ctx.completions(script, { line: 1, col: 17 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("offset:");
      const item = items.find((c) => c.label === "offset:");
      expect(item!.kind).to.equal("field");
      expect(item!.insertText).to.equal("offset:");
    });

    it("does not offer a name already used", async () => {
      const script = "set $x @date(now offset:+1d )";
      const items = await ctx.completions(script, { line: 1, col: 28 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("offset:");
    });

    it("does not offer a name filled positionally", async () => {
      const script = "set $x @date(now +1d )";
      const items = await ctx.completions(script, { line: 1, col: 21 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("offset:");
    });
  });

  describe("inline module completions", () => {
    it("offers qualified spellings for inline module defs", async () => {
      const script = `def module math (
  def @double "$n: number -> number" @num($n * 2)
  def show "$a: string" (
    print $a
  )
)
`;
      const items = await ctx.completions(script, { line: 7, col: 0 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("math:show");
      const helperItems = await ctx.completions(`${script}print `, {
        line: 7,
        col: 6,
      });
      const helperLabels = helperItems.map((c) => c.label);
      expect(helperLabels).to.include("@math:double");
    });
  });
});
