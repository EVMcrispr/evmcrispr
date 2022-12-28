import { runCases, runErrorCase } from '@1hive/evmcrispr-test-common';

import {
  HELPER_PARSER_ERROR,
  helperFunctionParser,
} from '../../src/parsers/helper';

export const helperParserDescribe = (): Mocha.Suite =>
  describe('Parsers - helper function', () => {
    it('should parse helpers correctly', () => {
      const cases: [string, any, string?][] = [
        [
          '@helperFunction(anotherToken::symbol(), "this is a string param", 10e18)',
          {
            type: 'HelperFunctionExpression',
            name: 'helperFunction',
            args: [
              {
                type: 'CallExpression',
                target: {
                  type: 'ProbableIdentifier',
                  value: 'anotherToken',
                  loc: {
                    start: { line: 1, col: 16 },
                    end: { line: 1, col: 28 },
                  },
                },
                method: 'symbol',
                args: [],
                loc: { start: { line: 1, col: 16 }, end: { line: 1, col: 38 } },
              },
              {
                type: 'StringLiteral',
                value: 'this is a string param',
                loc: { start: { line: 1, col: 40 }, end: { line: 1, col: 64 } },
              },
              {
                type: 'NumberLiteral',
                value: '10',
                power: 18,
                loc: { start: { line: 1, col: 66 }, end: { line: 1, col: 71 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 72 } },
          },
          'invalid helper with call expression match',
        ],
        [
          `@token(WETH)`,
          {
            type: 'HelperFunctionExpression',
            name: 'token',
            args: [
              {
                type: 'ProbableIdentifier',
                value: 'WETH',
                loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 11 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 12 } },
          },
          'invalid helper match',
        ],
        [
          `@now`,
          {
            type: 'HelperFunctionExpression',
            name: 'now',
            args: [],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 4 } },
          },
          'invalid helper without args match',
        ],
        [
          `@token('DAI', @calc(34, @innerHelper(true)))`,
          {
            type: 'HelperFunctionExpression',
            name: 'token',
            args: [
              {
                type: 'StringLiteral',
                value: 'DAI',
                loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 12 } },
              },
              {
                type: 'HelperFunctionExpression',
                name: 'calc',
                args: [
                  {
                    type: 'NumberLiteral',
                    value: '34',
                    loc: {
                      start: { line: 1, col: 20 },
                      end: { line: 1, col: 22 },
                    },
                  },
                  {
                    type: 'HelperFunctionExpression',
                    name: 'innerHelper',
                    args: [
                      {
                        type: 'BoolLiteral',
                        value: true,
                        loc: {
                          start: { line: 1, col: 37 },
                          end: { line: 1, col: 41 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 1, col: 24 },
                      end: { line: 1, col: 42 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 14 }, end: { line: 1, col: 43 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 44 } },
          },
          'invalid nested helper match',
        ],
      ];

      runCases(cases, helperFunctionParser);
    });

    it('should fail when parsing a helper with an invalid name', () => {
      runErrorCase(
        helperFunctionParser,
        '@asd&$6',
        HELPER_PARSER_ERROR,
        'Expecting a helper name',
      );
    });

    it('should fail when parsing a helper without a closing parenthesis', () => {
      runErrorCase(
        helperFunctionParser,
        '@helper(asda,1e18',
        HELPER_PARSER_ERROR,
      );
    });

    it('should fail when parsing a helper with empty arguments', () => {
      runErrorCase(
        helperFunctionParser,
        '@helper(arg1, 1e18, ,)',
        HELPER_PARSER_ERROR,
        'Expecting a valid expression',
      );
    });
  });
