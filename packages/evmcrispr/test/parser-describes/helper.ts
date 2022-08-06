import { helperFunctionParser } from '../../src/cas11/parsers/helper';
import { runCases } from '../test-helpers/cas11';

export const helperParserDescribe = (): Mocha.Suite =>
  describe('Helper parser', () => {
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
                target: { type: 'ProbableIdentifier', value: 'anotherToken' },
                method: 'symbol',
                args: [],
              },
              { type: 'StringLiteral', value: 'this is a string param' },
              { type: 'NumberLiteral', value: 10, power: 18 },
            ],
          },
          'invalid helper with call expression match',
        ],
        [
          `@token(WETH)`,
          {
            type: 'HelperFunctionExpression',
            name: 'token',
            args: [{ type: 'ProbableIdentifier', value: 'WETH' }],
          },
          'invalid helper match',
        ],
        [
          `@now`,
          {
            type: 'HelperFunctionExpression',
            name: 'now',
            args: [],
          },
          'invalid helper without args match',
        ],
        [
          `@token('DAI', @calc(34, @innerHelper(true)))`,
          {
            type: 'HelperFunctionExpression',
            name: 'token',
            args: [
              { type: 'StringLiteral', value: 'DAI' },
              {
                type: 'HelperFunctionExpression',
                name: 'calc',
                args: [
                  { type: 'NumberLiteral', value: 34 },
                  {
                    type: 'HelperFunctionExpression',
                    name: 'innerHelper',
                    args: [{ type: 'BoolLiteral', value: true }],
                  },
                ],
              },
            ],
          },
          'invalid nested helper match',
        ],
      ];

      runCases(cases, helperFunctionParser);
    });
  });
