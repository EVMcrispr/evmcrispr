import { describe, it } from "bun:test";
import type { ArrayExpressionNode, NodeParserState } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { type Case, runCases } from "@evmcrispr/test-utils/evml";
import type { Err } from "arcsecond";
import { withData } from "arcsecond";
import { arrayExpressionParser } from "../../../src/parsers/array";
import { createParserState } from "../../../src/parsers/utils";

describe("Parsers - array", () => {
  it("should parse an array correctly", () => {
    const cases: Case[] = [
      [
        '[    1 "a text string"    3    ]',
        {
          type: "ArrayExpression",
          elements: [
            {
              type: "NumberLiteral",
              value: "1",
              loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 6 } },
            },
            {
              type: "StringLiteral",
              value: "a text string",
              loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 22 } },
            },
            {
              type: "NumberLiteral",
              value: "3",
              loc: { start: { line: 1, col: 26 }, end: { line: 1, col: 27 } },
            },
          ],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 32 } },
        },
        "Invalid array match",
      ],
      [
        '[145e18y @token(DAI) false ["a string" anIdentifier [1 2 [aDeepDeepIdentifier.open]] $variable] $fDAIx::host()]',
        {
          type: "ArrayExpression",
          elements: [
            {
              type: "NumberLiteral",
              value: "145",
              power: 18,
              timeUnit: "y",
              loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 8 } },
            },
            {
              type: "HelperFunctionExpression",
              name: "token",
              args: [
                {
                  type: "Bareword",
                  value: "DAI",
                  loc: {
                    start: { line: 1, col: 16 },
                    end: { line: 1, col: 19 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 9 }, end: { line: 1, col: 20 } },
            },
            {
              type: "BoolLiteral",
              value: false,
              loc: { start: { line: 1, col: 21 }, end: { line: 1, col: 26 } },
            },
            {
              type: "ArrayExpression",
              elements: [
                {
                  type: "StringLiteral",
                  value: "a string",
                  loc: {
                    start: { line: 1, col: 28 },
                    end: { line: 1, col: 38 },
                  },
                },
                {
                  type: "Bareword",
                  value: "anIdentifier",
                  loc: {
                    start: { line: 1, col: 39 },
                    end: { line: 1, col: 51 },
                  },
                },
                {
                  type: "ArrayExpression",
                  elements: [
                    {
                      type: "NumberLiteral",
                      value: "1",
                      loc: {
                        start: { line: 1, col: 53 },
                        end: { line: 1, col: 54 },
                      },
                    },
                    {
                      type: "NumberLiteral",
                      value: "2",
                      loc: {
                        start: { line: 1, col: 55 },
                        end: { line: 1, col: 56 },
                      },
                    },
                    {
                      type: "ArrayExpression",
                      elements: [
                        {
                          type: "Bareword",
                          value: "aDeepDeepIdentifier.open",
                          loc: {
                            start: { line: 1, col: 58 },
                            end: { line: 1, col: 82 },
                          },
                        },
                      ],
                      loc: {
                        start: { line: 1, col: 57 },
                        end: { line: 1, col: 83 },
                      },
                    },
                  ],
                  loc: {
                    start: { line: 1, col: 52 },
                    end: { line: 1, col: 84 },
                  },
                },
                {
                  type: "VariableIdentifier",
                  value: "$variable",
                  loc: {
                    start: { line: 1, col: 85 },
                    end: { line: 1, col: 94 },
                  },
                },
              ],
              loc: {
                start: { line: 1, col: 27 },
                end: { line: 1, col: 95 },
              },
            },
            {
              type: "CallExpression",
              target: {
                type: "VariableIdentifier",
                value: "$fDAIx",
                loc: {
                  start: { line: 1, col: 96 },
                  end: { line: 1, col: 102 },
                },
              },
              method: "host",
              args: [],
              loc: {
                start: { line: 1, col: 96 },
                end: { line: 1, col: 110 },
              },
            },
          ],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 111 } },
        },
        "Invalid nested array match",
      ],
    ];

    runCases(cases, arrayExpressionParser);
  });

  it("should fail when parsing an array without closing bracket", () => {
    const res = withData<ArrayExpressionNode, string, NodeParserState>(
      arrayExpressionParser,
    )(createParserState()).run('[12e14w "asdas"');

    expect(res.isError).to.be.true;
    expect((res as Err<string, any>).error).to.equals(
      `ArrayParserError(1:15): Expecting character ']', but got end of input.`,
    );
  });

  it("should parse an array whose elements span multiple lines", () => {
    const cases: Case[] = [
      [
        `[\n  1\n  2\n  3\n]`,
        {
          type: "ArrayExpression",
          elements: [
            {
              type: "NumberLiteral",
              value: "1",
              loc: { start: { line: 2, col: 2 }, end: { line: 2, col: 3 } },
            },
            {
              type: "NumberLiteral",
              value: "2",
              loc: { start: { line: 3, col: 2 }, end: { line: 3, col: 3 } },
            },
            {
              type: "NumberLiteral",
              value: "3",
              loc: { start: { line: 4, col: 2 }, end: { line: 4, col: 3 } },
            },
          ],
          loc: { start: { line: 1, col: 0 }, end: { line: 5, col: 1 } },
        },
        "Invalid multiline array match",
      ],
    ];

    runCases(cases, arrayExpressionParser);
  });
});
