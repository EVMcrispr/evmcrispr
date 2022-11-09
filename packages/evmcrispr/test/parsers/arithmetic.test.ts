import { arithmeticParser } from '../../src/parsers/arithmetic';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

describe('Parsers - arithmetic', () => {
  it('should parse an arithmetic operation correctly', () => {
    const c: Case = [
      '(9 + 5 - 4 * 4 / 3)',
      {
        type: 'BinaryExpression',
        operator: '-',
        left: {
          type: 'BinaryExpression',
          operator: '+',
          left: {
            type: 'NumberLiteral',
            value: '9',
            loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 2 } },
          },
          right: {
            type: 'NumberLiteral',
            value: '5',
            loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 6 } },
          },
          loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 6 } },
        },
        right: {
          type: 'BinaryExpression',
          operator: '/',
          left: {
            type: 'BinaryExpression',
            operator: '*',
            left: {
              type: 'NumberLiteral',
              value: '4',
              loc: { start: { line: 1, col: 9 }, end: { line: 1, col: 10 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '4',
              loc: { start: { line: 1, col: 13 }, end: { line: 1, col: 14 } },
            },
            loc: { start: { line: 1, col: 9 }, end: { line: 1, col: 14 } },
          },
          right: {
            type: 'NumberLiteral',
            value: '3',
            loc: { start: { line: 1, col: 17 }, end: { line: 1, col: 18 } },
          },
          loc: { start: { line: 1, col: 9 }, end: { line: 1, col: 18 } },
        },
        loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 18 } },
      },
    ];

    runCases(c, arithmeticParser);
  });

  it('should parse an arithmetic operation with trailing spaces correctly', () => {
    const cases: Case[] = [
      [
        '(   9 + 5 - 4 * (4 / 3)      )',
        {
          type: 'BinaryExpression',
          operator: '-',
          left: {
            type: 'BinaryExpression',
            operator: '+',
            left: {
              type: 'NumberLiteral',
              value: '9',
              loc: { start: { line: 1, col: 4 }, end: { line: 1, col: 5 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '5',
              loc: { start: { line: 1, col: 8 }, end: { line: 1, col: 9 } },
            },
            loc: { start: { line: 1, col: 4 }, end: { line: 1, col: 9 } },
          },
          right: {
            type: 'BinaryExpression',
            operator: '*',
            left: {
              type: 'NumberLiteral',
              value: '4',
              loc: { start: { line: 1, col: 12 }, end: { line: 1, col: 13 } },
            },
            right: {
              type: 'BinaryExpression',
              operator: '/',
              left: {
                type: 'NumberLiteral',
                value: '4',
                loc: {
                  start: { line: 1, col: 17 },
                  end: { line: 1, col: 18 },
                },
              },
              right: {
                type: 'NumberLiteral',
                value: '3',
                loc: {
                  start: { line: 1, col: 21 },
                  end: { line: 1, col: 22 },
                },
              },
              loc: { start: { line: 1, col: 17 }, end: { line: 1, col: 22 } },
            },
            loc: { start: { line: 1, col: 12 }, end: { line: 1, col: 22 } },
          },
          loc: { start: { line: 1, col: 4 }, end: { line: 1, col: 22 } },
        },
        'inner left and right trailing spaces mismatch',
      ],
      [
        '(9 +    5    - 4    *     4   /    3)',
        {
          type: 'BinaryExpression',
          operator: '-',
          left: {
            type: 'BinaryExpression',
            operator: '+',
            left: {
              type: 'NumberLiteral',
              value: '9',
              loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 2 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '5',
              loc: { start: { line: 1, col: 8 }, end: { line: 1, col: 9 } },
            },
            loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 9 } },
          },
          right: {
            type: 'BinaryExpression',
            operator: '/',
            left: {
              type: 'BinaryExpression',
              operator: '*',
              left: {
                type: 'NumberLiteral',
                value: '4',
                loc: {
                  start: { line: 1, col: 15 },
                  end: { line: 1, col: 16 },
                },
              },
              right: {
                type: 'NumberLiteral',
                value: '4',
                loc: {
                  start: { line: 1, col: 26 },
                  end: { line: 1, col: 27 },
                },
              },
              loc: { start: { line: 1, col: 15 }, end: { line: 1, col: 27 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '3',
              loc: { start: { line: 1, col: 35 }, end: { line: 1, col: 36 } },
            },
            loc: { start: { line: 1, col: 15 }, end: { line: 1, col: 36 } },
          },
          loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 36 } },
        },
        'in-between trailing spaces mismatch ',
      ],
    ];

    runCases(cases, arithmeticParser);
  });

  it('should parse an arithmetic operation containing priority parentheses correctly', () => {
    const c: Case = [
      '(9 + (5 - 4) * (4 / 3))',
      {
        type: 'BinaryExpression',
        operator: '+',
        left: {
          type: 'NumberLiteral',
          value: '9',
          loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 2 } },
        },
        right: {
          type: 'BinaryExpression',
          operator: '*',
          left: {
            type: 'BinaryExpression',
            operator: '-',
            left: {
              type: 'NumberLiteral',
              value: '5',
              loc: { start: { line: 1, col: 6 }, end: { line: 1, col: 7 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '4',
              loc: { start: { line: 1, col: 10 }, end: { line: 1, col: 11 } },
            },
            loc: { start: { line: 1, col: 6 }, end: { line: 1, col: 11 } },
          },
          right: {
            type: 'BinaryExpression',
            operator: '/',
            left: {
              type: 'NumberLiteral',
              value: '4',
              loc: { start: { line: 1, col: 16 }, end: { line: 1, col: 17 } },
            },
            right: {
              type: 'NumberLiteral',
              value: '3',
              loc: { start: { line: 1, col: 20 }, end: { line: 1, col: 21 } },
            },
            loc: { start: { line: 1, col: 16 }, end: { line: 1, col: 21 } },
          },
          loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 21 } },
        },
        loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 21 } },
      },
    ];

    runCases(c, arithmeticParser);
  });

  it('should parse an arithmetic operation containing variable helpers and call expressions correctly', () => {
    const c: Case = [
      '(90.45e18 + (5000e18 - @token.balance( DAI, @me)) * (someContract::getAmount() / 3) + $some-Variable)',
      {
        type: 'BinaryExpression',
        operator: '+',
        left: {
          type: 'BinaryExpression',
          operator: '+',
          left: {
            type: 'NumberLiteral',
            value: '90.45',
            power: 18,
            loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 9 } },
          },
          right: {
            type: 'BinaryExpression',
            operator: '*',
            left: {
              type: 'BinaryExpression',
              operator: '-',
              left: {
                type: 'NumberLiteral',
                value: '5000',
                power: 18,
                loc: {
                  start: { line: 1, col: 13 },
                  end: { line: 1, col: 20 },
                },
              },
              right: {
                type: 'HelperFunctionExpression',
                name: 'token.balance',
                args: [
                  {
                    type: 'ProbableIdentifier',
                    value: 'DAI',
                    loc: {
                      start: { line: 1, col: 39 },
                      end: { line: 1, col: 42 },
                    },
                  },
                  {
                    type: 'HelperFunctionExpression',
                    name: 'me',
                    args: [],
                    loc: {
                      start: { line: 1, col: 44 },
                      end: { line: 1, col: 47 },
                    },
                  },
                ],
                loc: {
                  start: { line: 1, col: 23 },
                  end: { line: 1, col: 48 },
                },
              },
              loc: { start: { line: 1, col: 13 }, end: { line: 1, col: 48 } },
            },
            right: {
              type: 'BinaryExpression',
              operator: '/',
              left: {
                type: 'CallExpression',
                target: {
                  type: 'ProbableIdentifier',
                  value: 'someContract',
                  loc: {
                    start: { line: 1, col: 53 },
                    end: { line: 1, col: 65 },
                  },
                },
                method: 'getAmount',
                args: [],
                loc: {
                  start: { line: 1, col: 53 },
                  end: { line: 1, col: 78 },
                },
              },
              right: {
                type: 'NumberLiteral',
                value: '3',
                loc: {
                  start: { line: 1, col: 81 },
                  end: { line: 1, col: 82 },
                },
              },
              loc: { start: { line: 1, col: 53 }, end: { line: 1, col: 82 } },
            },
            loc: { start: { line: 1, col: 12 }, end: { line: 1, col: 82 } },
          },
          loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 82 } },
        },
        right: {
          type: 'VariableIdentifier',
          value: '$some-Variable',
          loc: { start: { line: 1, col: 86 }, end: { line: 1, col: 100 } },
        },
        loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 100 } },
      },
    ];

    runCases(c, arithmeticParser);
  });
});
