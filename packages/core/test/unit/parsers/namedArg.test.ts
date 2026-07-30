import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { runParser } from "@evmcrispr/test-utils/evml";
import { arrayExpressionParser } from "../../../src/parsers/array";
import { helperFunctionParser } from "../../../src/parsers/helper";

const parseHelperArgs = (source: string): any[] =>
  runParser(helperFunctionParser, source).args;

const parseElements = (source: string): any[] =>
  runParser(arrayExpressionParser, source).elements;

describe("Parsers - named args", () => {
  describe("in helper parens", () => {
    it("parses name:value after positional args", () => {
      const [pos, named] = parseHelperArgs("@h(val opt:3)");
      expect(pos.type).to.equal("Bareword");
      expect(named.type).to.equal("NamedArg");
      expect(named.name).to.equal("opt");
      expect(named.value.type).to.equal("NumberLiteral");
      expect(named.value.value).to.equal("3");
    });

    it("accepts dashed names (via-ir:true)", () => {
      const [named] = parseHelperArgs("@h(via-ir:true)");
      expect(named.type).to.equal("NamedArg");
      expect(named.name).to.equal("via-ir");
      expect(named.value.type).to.equal("BoolLiteral");
    });

    it("accepts $var, @helper(...), arrays and strings as values", () => {
      const args = parseHelperArgs('@h(a:$x b:@me c:[1 2] d:"s t")');
      expect(args.map((a) => a.value.type)).to.eql([
        "VariableIdentifier",
        "HelperFunctionExpression",
        "ArrayExpression",
        "StringLiteral",
      ]);
    });

    it("records the source location of the whole name:value span", () => {
      const [named] = parseHelperArgs("@h(opt:3)");
      expect(named.loc).to.eql({
        start: { line: 1, col: 3 },
        end: { line: 1, col: 8 },
      });
    });

    it("leaves URLs as barewords (value must not start with /)", () => {
      const [arg] = parseHelperArgs("@h(https://google.com)");
      expect(arg.type).to.equal("Bareword");
      expect(arg.value).to.equal("https://google.com");
      const [ipfs] = parseHelperArgs("@h(ipfs://QmXoypizj)");
      expect(ipfs.type).to.equal("Bareword");
    });

    it("allows URL values inside a named arg", () => {
      const [named] = parseHelperArgs("@h(ptau:ipfs://QmXoypizj)");
      expect(named.type).to.equal("NamedArg");
      expect(named.name).to.equal("ptau");
      expect(named.value.type).to.equal("Bareword");
      expect(named.value.value).to.equal("ipfs://QmXoypizj");
    });

    it("leaves non-matching colon tokens as barewords", () => {
      // digit-first name
      expect(parseHelperArgs("@h(9lives:1)")[0].type).to.equal("Bareword");
      // trailing-dash name
      expect(parseHelperArgs("@h(via-:1)")[0].type).to.equal("Bareword");
      // no value (colon at end)
      expect(parseHelperArgs("@h(a:)")[0].value).to.equal("a:");
      // space after colon
      const spaced = parseHelperArgs("@h(a: 1)");
      expect(spaced[0].value).to.equal("a:");
      expect(spaced[1].type).to.equal("NumberLiteral");
    });

    it("does not swallow call expressions", () => {
      const [arg] = parseHelperArgs("@h($t::symbol())");
      expect(arg.type).to.equal("CallExpression");
    });
  });

  describe("in array literals", () => {
    it("parses record entries", () => {
      const [a, b] = parseElements("[a:1 b:2]");
      expect(a.type).to.equal("NamedArg");
      expect(a.name).to.equal("a");
      expect(b.name).to.equal("b");
    });

    it("nests arrays as record values", () => {
      const [siblings] = parseElements("[siblings:[1 2 3]]");
      expect(siblings.type).to.equal("NamedArg");
      expect(siblings.value.type).to.equal("ArrayExpression");
      expect(siblings.value.elements).to.have.length(3);
    });

    it("leaves URL elements as barewords", () => {
      const [url] = parseElements("[https://google.com]");
      expect(url.type).to.equal("Bareword");
      expect(url.value).to.equal("https://google.com");
    });
  });
});
