import type { Case } from '@1hive/evmcrispr-test-common';
import { runCases, runErrorCase } from '@1hive/evmcrispr-test-common';
import type { Err } from 'arcsecond';
import { withData } from 'arcsecond';
import { expect } from 'chai';

import {
  ARRAY_PARSER_ERROR,
  arrayExpressionParser,
} from '../../src/parsers/array';
import { createParserState } from '../../src/parsers/utils';
import type { ArrayExpressionNode, NodeParserState } from '../../src/types';

describe('Parsers - array', () => {
  it('should parse an array correctly', () => {
    const cases: Case[] = [
      [
        '[    1, "a text string",    3    ]',
        {
          type: 'ArrayExpression',
          elements: [
            {
              type: 'NumberLiteral',
              value: '1',
              loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 6 } },
            },
            {
              type: 'StringLiteral',
              value: 'a text string',
              loc: { start: { line: 1, col: 8 }, end: { line: 1, col: 23 } },
            },
            {
              type: 'NumberLiteral',
              value: '3',
              loc: { start: { line: 1, col: 28 }, end: { line: 1, col: 29 } },
            },
          ],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 34 } },
        },
        'Invalid array match',
      ],
      [
        '[145e18y, @token(DAI), false, ["a string", anIdentifier, [1, 2, [aDeepDeepIdentifier.open]],  $variable], $fDAIx::host()]',
        {
          type: 'ArrayExpression',
          elements: [
            {
              type: 'NumberLiteral',
              value: '145',
              power: 18,
              timeUnit: 'y',
              loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 8 } },
            },
            {
              type: 'HelperFunctionExpression',
              name: 'token',
              args: [
                {
                  type: 'ProbableIdentifier',
                  value: 'DAI',
                  loc: {
                    start: { line: 1, col: 17 },
                    end: { line: 1, col: 20 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 10 }, end: { line: 1, col: 21 } },
            },
            {
              type: 'BoolLiteral',
              value: false,
              loc: { start: { line: 1, col: 23 }, end: { line: 1, col: 28 } },
            },
            {
              type: 'ArrayExpression',
              elements: [
                {
                  type: 'StringLiteral',
                  value: 'a string',
                  loc: {
                    start: { line: 1, col: 31 },
                    end: { line: 1, col: 41 },
                  },
                },
                {
                  type: 'ProbableIdentifier',
                  value: 'anIdentifier',
                  loc: {
                    start: { line: 1, col: 43 },
                    end: { line: 1, col: 55 },
                  },
                },
                {
                  type: 'ArrayExpression',
                  elements: [
                    {
                      type: 'NumberLiteral',
                      value: '1',
                      loc: {
                        start: { line: 1, col: 58 },
                        end: { line: 1, col: 59 },
                      },
                    },
                    {
                      type: 'NumberLiteral',
                      value: '2',
                      loc: {
                        start: { line: 1, col: 61 },
                        end: { line: 1, col: 62 },
                      },
                    },
                    {
                      type: 'ArrayExpression',
                      elements: [
                        {
                          type: 'ProbableIdentifier',
                          value: 'aDeepDeepIdentifier.open',
                          loc: {
                            start: { line: 1, col: 65 },
                            end: { line: 1, col: 89 },
                          },
                        },
                      ],
                      loc: {
                        start: { line: 1, col: 64 },
                        end: { line: 1, col: 90 },
                      },
                    },
                  ],
                  loc: {
                    start: { line: 1, col: 57 },
                    end: { line: 1, col: 91 },
                  },
                },
                {
                  type: 'VariableIdentifier',
                  value: '$variable',
                  loc: {
                    start: { line: 1, col: 94 },
                    end: { line: 1, col: 103 },
                  },
                },
              ],
              loc: {
                start: { line: 1, col: 30 },
                end: { line: 1, col: 104 },
              },
            },
            {
              type: 'CallExpression',
              target: {
                type: 'VariableIdentifier',
                value: '$fDAIx',
                loc: {
                  start: { line: 1, col: 106 },
                  end: { line: 1, col: 112 },
                },
              },
              method: 'host',
              args: [],
              loc: {
                start: { line: 1, col: 106 },
                end: { line: 1, col: 120 },
              },
            },
          ],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 121 } },
        },
        'Invalid nested array match',
      ],
    ];

    runCases(cases, arrayExpressionParser);
  });

  it('should fail when parsing an array with multiple primary values between commas', () => {
    runErrorCase(
      arrayExpressionParser,
      '[1,multiple values between commas, false]',
      ARRAY_PARSER_ERROR,
      `Expecting character ']'`,
    );
  });

  it('should fail when parsing an array with empty elements', () => {
    runErrorCase(
      arrayExpressionParser,
      '[12e14w, ,,]',
      ARRAY_PARSER_ERROR,
      'Expecting a valid expression',
    );
  });

  it('should fail when parsing an array without closing bracket', () => {
    const res = withData<ArrayExpressionNode, string, NodeParserState>(
      arrayExpressionParser,
    )(createParserState()).run('[12e14w, "asdas"');

    expect(res.isError).to.be.true;
    expect((res as Err<string, any>).error).to.equals(
      `ArrayParserError(1:16): Expecting character ']', but got end of input.`,
    );
  });
});
