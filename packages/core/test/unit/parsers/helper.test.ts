import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { runCases, runErrorCase, runParser } from "@evmcrispr/test-utils/evml";
import {
  HELPER_PARSER_ERROR,
  helperFunctionParser,
} from "../../../src/parsers/helper";

export const helperParserDescribe = () =>
  describe("Parsers - helper function", () => {
    it("should parse helpers correctly", () => {
      const cases: [string, any, string?][] = [
        [
          '@helperFunction(anotherToken::symbol() "this is a string param" 10e18)',
          {
            type: "HelperFunctionExpression",
            name: "helperFunction",
            args: [
              {
                type: "CallExpression",
                target: {
                  type: "Bareword",
                  value: "anotherToken",
                  loc: {
                    start: { line: 1, col: 16 },
                    end: { line: 1, col: 28 },
                  },
                },
                method: "symbol",
                args: [],
                loc: { start: { line: 1, col: 16 }, end: { line: 1, col: 38 } },
              },
              {
                type: "StringLiteral",
                value: "this is a string param",
                loc: { start: { line: 1, col: 39 }, end: { line: 1, col: 63 } },
              },
              {
                type: "NumberLiteral",
                value: "10",
                power: 18,
                loc: { start: { line: 1, col: 64 }, end: { line: 1, col: 69 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 70 } },
          },
          "invalid helper with call expression match",
        ],
        [
          `@token(WETH)`,
          {
            type: "HelperFunctionExpression",
            name: "token",
            args: [
              {
                type: "Bareword",
                value: "WETH",
                loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 11 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 12 } },
          },
          "invalid helper match",
        ],
        [
          `@now`,
          {
            type: "HelperFunctionExpression",
            name: "now",
            args: [],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 4 } },
          },
          "invalid helper without args match",
        ],
        [
          `@token('DAI' @calc(34 @innerHelper(true)))`,
          {
            type: "HelperFunctionExpression",
            name: "token",
            args: [
              {
                type: "StringLiteral",
                value: "DAI",
                loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 12 } },
              },
              {
                type: "HelperFunctionExpression",
                name: "calc",
                args: [
                  {
                    type: "NumberLiteral",
                    value: "34",
                    loc: {
                      start: { line: 1, col: 19 },
                      end: { line: 1, col: 21 },
                    },
                  },
                  {
                    type: "HelperFunctionExpression",
                    name: "innerHelper",
                    args: [
                      {
                        type: "BoolLiteral",
                        value: true,
                        loc: {
                          start: { line: 1, col: 35 },
                          end: { line: 1, col: 39 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 1, col: 22 },
                      end: { line: 1, col: 40 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 13 }, end: { line: 1, col: 41 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 42 } },
          },
          "invalid nested helper match",
        ],
      ];

      runCases(cases, helperFunctionParser);
    });

    it("should fail when parsing a helper with an invalid name", () => {
      runErrorCase(
        helperFunctionParser,
        "@asd&$6",
        HELPER_PARSER_ERROR,
        'Expected a helper name after "@" (e.g. @token(DAI) or @me)',
      );
    });

    it("should fail when parsing a helper without a closing parenthesis", () => {
      runErrorCase(
        helperFunctionParser,
        "@helper(asda 1e18",
        HELPER_PARSER_ERROR,
      );
    });

    it("should fail when parsing a helper with empty arguments", () => {
      runErrorCase(
        helperFunctionParser,
        "@helper(arg1 1e18 )",
        HELPER_PARSER_ERROR,
      );
    });
  });

describe("Parsers - helper function (multiline)", () => {
  it("should parse a helper whose args span multiple lines", () => {
    const script = `@helper(
  arg1
  "two
  lines"
  42
)`;
    const result = runParser(helperFunctionParser, script);
    expect(result).to.deep.include({
      type: "HelperFunctionExpression",
      name: "helper",
    });
    expect(result.args).to.have.lengthOf(3);
    expect(result.args[0]).to.deep.include({
      type: "Bareword",
      value: "arg1",
    });
    expect(result.args[0].loc).to.eql({
      start: { line: 2, col: 2 },
      end: { line: 2, col: 6 },
    });
    expect(result.args[1]).to.deep.include({
      type: "StringLiteral",
      value: "two\n  lines",
    });
    expect(result.args[1].loc).to.eql({
      start: { line: 3, col: 2 },
      end: { line: 4, col: 8 },
    });
    expect(result.args[2]).to.deep.include({
      type: "NumberLiteral",
      value: "42",
    });
    expect(result.args[2].loc).to.eql({
      start: { line: 5, col: 2 },
      end: { line: 5, col: 4 },
    });
    expect(result.loc).to.eql({
      start: { line: 1, col: 0 },
      end: { line: 6, col: 1 },
    });
  });

  it("should parse a helper with newlines around the parens", () => {
    const result = runParser(helperFunctionParser, `@h(\n  arg1\n  arg2\n)`);
    expect(result.name).to.equal("h");
    expect(result.args.map((a: any) => a.value)).to.eql(["arg1", "arg2"]);
  });
});
