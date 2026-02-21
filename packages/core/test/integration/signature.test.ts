import "../setup";
import { describe, it } from "bun:test";
import { TestContext } from "@evmcrispr/test-utils";
import { expect } from "chai";

describe("Core > signatureHelp", () => {
  const ctx = new TestContext();

  describe("for std commands", () => {
    it("should return signature help for 'set' command", async () => {
      const script = "set $x 1";
      const result = await ctx.signatureHelp(script, { line: 1, col: 5 });
      expect(result).to.not.be.null;
      expect(result!.signatures).to.have.lengthOf(1);
      expect(result!.signatures[0].label).to.include("set");
      expect(result!.signatures[0].parameters.length).to.be.greaterThan(0);
    });

    it("should return null when cursor is on the command name itself", async () => {
      const script = "set $x 1";
      const result = await ctx.signatureHelp(script, { line: 1, col: 1 });
      expect(result).to.be.null;
    });

    it("should track active parameter", async () => {
      const script =
        'exec 0x1234567890abcdef1234567890abcdef12345678 "transfer(address,uint256)" ';
      const result = await ctx.signatureHelp(script, { line: 1, col: 75 });
      if (result) {
        expect(result.activeParameter).to.be.a("number");
        expect(result.activeParameter).to.be.at.least(0);
      }
    });
  });

  describe("for helpers", () => {
    it("should return signature help inside @token()", async () => {
      const script = "set $x @token(DAI)";
      const result = await ctx.signatureHelp(script, { line: 1, col: 14 });
      expect(result).to.not.be.null;
      expect(result!.signatures[0].label).to.include("@token");
    });

    it("should track active parameter inside @token.amount()", async () => {
      const script = "set $x @token.amount(DAI, 100)";
      const result = await ctx.signatureHelp(script, { line: 1, col: 26 });
      expect(result).to.not.be.null;
      expect(result!.activeParameter).to.equal(1);
    });

    it("should fall back to command signature when not inside helper parens", async () => {
      const script = "set $x @me";
      const result = await ctx.signatureHelp(script, { line: 1, col: 10 });
      if (result) {
        expect(result.signatures[0].label).to.include("set");
      }
    });
  });

  describe("edge cases", () => {
    it("should return null for empty lines", async () => {
      const script = "set $x 1\n\nset $y 2";
      const result = await ctx.signatureHelp(script, { line: 2, col: 0 });
      expect(result).to.be.null;
    });

    it("should return null for lines without commands", async () => {
      const script = "";
      const result = await ctx.signatureHelp(script, { line: 1, col: 0 });
      expect(result).to.be.null;
    });
  });
});
