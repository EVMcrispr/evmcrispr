import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { runParser } from "@evmcrispr/test-utils/evml";
import { destructurePatternParser } from "../../../src/parsers/destructure";

describe("Parsers - destructure pattern", () => {
  it("should parse a flat pattern with two variables", () => {
    const result = runParser(destructurePatternParser, "[$a $b]");
    expect(result.type).to.equal("DestructurePattern");
    expect(result.slots).to.deep.equal(["$a", "$b"]);
  });

  it("should parse a pattern with a leading hole", () => {
    const result = runParser(destructurePatternParser, "[_ $b]");
    expect(result.slots).to.deep.equal([null, "$b"]);
  });

  it("should parse a pattern with a middle hole", () => {
    const result = runParser(destructurePatternParser, "[$a _ $c]");
    expect(result.slots).to.deep.equal(["$a", null, "$c"]);
  });

  it("should parse a nested destructure pattern", () => {
    const result = runParser(destructurePatternParser, "[$a [_ $b]]");
    expect(result.slots).to.deep.equal(["$a", [null, "$b"]]);
  });

  it("should parse a deeply nested pattern", () => {
    const result = runParser(destructurePatternParser, "[$a [$b [$c $d]]]");
    expect(result.slots).to.deep.equal(["$a", ["$b", ["$c", "$d"]]]);
  });

  it("should parse an empty pattern", () => {
    const result = runParser(destructurePatternParser, "[]");
    expect(result.slots).to.deep.equal([]);
  });

  it("should parse a single-element pattern", () => {
    const result = runParser(destructurePatternParser, "[$x]");
    expect(result.slots).to.deep.equal(["$x"]);
  });

  it("should parse a pattern with all holes", () => {
    const result = runParser(destructurePatternParser, "[_ _ _]");
    expect(result.slots).to.deep.equal([null, null, null]);
  });

  it("should parse a pattern with whitespace around elements", () => {
    const result = runParser(destructurePatternParser, "[ $a  $b ]");
    expect(result.slots).to.deep.equal(["$a", "$b"]);
  });

  it("should parse a pattern with kebab-case variables", () => {
    const result = runParser(
      destructurePatternParser,
      "[$my-var $another-var]",
    );
    expect(result.slots).to.deep.equal(["$my-var", "$another-var"]);
  });
});
