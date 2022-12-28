import type { Case } from '@1hive/evmcrispr-test-common';
import { runCases } from '@1hive/evmcrispr-test-common';

import { callExpressionParser } from '../../src/parsers/call';

export const callParserDescribe = (): Mocha.Suite =>
  describe('Parsers - call expression', () => {
    it('should parse call expressions correctly', () => {
      const cases: Case[] = [
        [
          `0x14FA5C16Af56190239B997485656F5c8b4f86c4b::getEntry(0, @token(WETH))`,
          {
            type: 'CallExpression',
            target: {
              type: 'AddressLiteral',
              value: '0x14FA5C16Af56190239B997485656F5c8b4f86c4b',
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 42 } },
            },
            method: 'getEntry',
            args: [
              {
                type: 'NumberLiteral',
                value: '0',
                loc: { start: { line: 1, col: 53 }, end: { line: 1, col: 54 } },
              },
              {
                type: 'HelperFunctionExpression',
                name: 'token',
                args: [
                  {
                    type: 'ProbableIdentifier',
                    value: 'WETH',
                    loc: {
                      start: { line: 1, col: 63 },
                      end: { line: 1, col: 67 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 56 }, end: { line: 1, col: 68 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 69 } },
          },
        ],
        [
          `$superfluid::createFlow(@token("DAIx"), $finance::vault([1,2,3]), $contract::method(), 10e18m, 'this is a nice description')`,
          {
            type: 'CallExpression',
            target: {
              type: 'VariableIdentifier',
              value: '$superfluid',
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 11 } },
            },
            method: 'createFlow',
            args: [
              {
                type: 'HelperFunctionExpression',
                name: 'token',
                args: [
                  {
                    type: 'StringLiteral',
                    value: 'DAIx',
                    loc: {
                      start: { line: 1, col: 31 },
                      end: { line: 1, col: 37 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 24 }, end: { line: 1, col: 38 } },
              },
              {
                type: 'CallExpression',
                target: {
                  type: 'VariableIdentifier',
                  value: '$finance',
                  loc: {
                    start: { line: 1, col: 40 },
                    end: { line: 1, col: 48 },
                  },
                },
                method: 'vault',
                args: [
                  {
                    type: 'ArrayExpression',
                    elements: [
                      {
                        type: 'NumberLiteral',
                        value: '1',
                        loc: {
                          start: { line: 1, col: 57 },
                          end: { line: 1, col: 58 },
                        },
                      },
                      {
                        type: 'NumberLiteral',
                        value: '2',
                        loc: {
                          start: { line: 1, col: 59 },
                          end: { line: 1, col: 60 },
                        },
                      },
                      {
                        type: 'NumberLiteral',
                        value: '3',
                        loc: {
                          start: { line: 1, col: 61 },
                          end: { line: 1, col: 62 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 1, col: 56 },
                      end: { line: 1, col: 63 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 40 }, end: { line: 1, col: 64 } },
              },
              {
                type: 'CallExpression',
                target: {
                  type: 'VariableIdentifier',
                  value: '$contract',
                  loc: {
                    start: { line: 1, col: 66 },
                    end: { line: 1, col: 75 },
                  },
                },
                method: 'method',
                args: [],
                loc: { start: { line: 1, col: 66 }, end: { line: 1, col: 85 } },
              },
              {
                type: 'NumberLiteral',
                value: '10',
                power: 18,
                timeUnit: 'm',
                loc: { start: { line: 1, col: 87 }, end: { line: 1, col: 93 } },
              },
              {
                type: 'StringLiteral',
                value: 'this is a nice description',
                loc: {
                  start: { line: 1, col: 95 },
                  end: { line: 1, col: 123 },
                },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 124 } },
          },
          'invalid nested call expression',
        ],
        [
          `@token(DAIx)::upgrade(@token(DAI), 1800e18)`,
          {
            type: 'CallExpression',
            target: {
              type: 'HelperFunctionExpression',
              name: 'token',
              args: [
                {
                  type: 'ProbableIdentifier',
                  value: 'DAIx',
                  loc: {
                    start: { line: 1, col: 7 },
                    end: { line: 1, col: 11 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 12 } },
            },
            method: 'upgrade',
            args: [
              {
                type: 'HelperFunctionExpression',
                name: 'token',
                args: [
                  {
                    type: 'ProbableIdentifier',
                    value: 'DAI',
                    loc: {
                      start: { line: 1, col: 29 },
                      end: { line: 1, col: 32 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 22 }, end: { line: 1, col: 33 } },
              },
              {
                type: 'NumberLiteral',
                value: '1800',
                power: 18,
                loc: { start: { line: 1, col: 35 }, end: { line: 1, col: 42 } },
              },
            ],
            loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 43 } },
          },
          'invalid helper call expression',
        ],
        [
          `$registryContract::getToken(1)::approve(@me, 560.25e18)::another()`,
          {
            type: 'CallExpression',
            target: {
              type: 'CallExpression',
              target: {
                type: 'CallExpression',
                target: {
                  type: 'VariableIdentifier',
                  value: '$registryContract',
                  loc: {
                    start: { line: 1, col: 0 },
                    end: { line: 1, col: 17 },
                  },
                },
                method: 'getToken',
                args: [
                  {
                    type: 'NumberLiteral',
                    value: '1',
                    loc: {
                      start: { line: 1, col: 28 },
                      end: { line: 1, col: 29 },
                    },
                  },
                ],
                loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 30 } },
              },
              method: 'approve',
              args: [
                {
                  type: 'HelperFunctionExpression',
                  name: 'me',
                  args: [],
                  loc: {
                    start: { line: 1, col: 40 },
                    end: { line: 1, col: 43 },
                  },
                },
                {
                  type: 'NumberLiteral',
                  value: '560.25',
                  power: 18,
                  loc: {
                    start: { line: 1, col: 45 },
                    end: { line: 1, col: 54 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 32 }, end: { line: 1, col: 55 } },
            },
            method: 'another',
            args: [],
            loc: { start: { line: 1, col: 57 }, end: { line: 1, col: 66 } },
          },
          'invalid recursive call expression',
        ],
      ];

      runCases(cases, callExpressionParser);
    });
  });
