import type { Case } from '@1hive/evmcrispr-test-common';
import { runCases } from '@1hive/evmcrispr-test-common';

import { scriptParser } from '../../src';

describe('Parsers - comment', () => {
  it('should parse a comment correctly', () => {
    const c: Case = [
      `
        # a comment here
        load aragonos as ar

        #another one here
        set $var1 1e18

        #one at the end
      `,
      {
        type: 'Program',
        body: [
          {
            type: 'CommandExpression',
            name: 'load',
            args: [
              {
                type: 'AsExpression',
                left: {
                  type: 'ProbableIdentifier',
                  value: 'aragonos',
                  loc: {
                    start: { line: 3, col: 13 },
                    end: { line: 3, col: 21 },
                  },
                },
                right: {
                  type: 'ProbableIdentifier',
                  value: 'ar',
                  loc: {
                    start: { line: 3, col: 25 },
                    end: { line: 3, col: 27 },
                  },
                },
                loc: {
                  start: { line: 3, col: 13 },
                  end: { line: 3, col: 27 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 3, col: 8 }, end: { line: 3, col: 27 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$var1',
                loc: {
                  start: { line: 6, col: 12 },
                  end: { line: 6, col: 17 },
                },
              },
              {
                type: 'NumberLiteral',
                value: '1',
                power: 18,
                loc: {
                  start: { line: 6, col: 18 },
                  end: { line: 6, col: 22 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 6, col: 8 }, end: { line: 6, col: 22 } },
          },
        ],
      },
    ];

    runCases(c, scriptParser);
  });

  it('should parse an inline comment', () => {
    const c: Case = [
      `
          load aragonos as ar # this is an inline comment
          set $var1 1e18 #another one
        `,
      {
        type: 'Program',
        body: [
          {
            type: 'CommandExpression',
            name: 'load',
            args: [
              {
                type: 'AsExpression',
                left: {
                  type: 'ProbableIdentifier',
                  value: 'aragonos',
                  loc: {
                    start: { line: 2, col: 15 },
                    end: { line: 2, col: 23 },
                  },
                },
                right: {
                  type: 'ProbableIdentifier',
                  value: 'ar',
                  loc: {
                    start: { line: 2, col: 27 },
                    end: { line: 2, col: 29 },
                  },
                },
                loc: {
                  start: { line: 2, col: 15 },
                  end: { line: 2, col: 29 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 2, col: 10 }, end: { line: 2, col: 29 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$var1',
                loc: {
                  start: { line: 3, col: 14 },
                  end: { line: 3, col: 19 },
                },
              },
              {
                type: 'NumberLiteral',
                value: '1',
                power: 18,
                loc: {
                  start: { line: 3, col: 20 },
                  end: { line: 3, col: 24 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 3, col: 10 }, end: { line: 3, col: 24 } },
          },
        ],
      },
    ];

    runCases(c, scriptParser);
  });
});
