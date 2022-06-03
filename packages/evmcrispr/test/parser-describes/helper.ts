import { helperFunctionParser } from '../../src/cas11/parsers/helper';
import { runCases } from '../test-helpers/cas11';

export const helperParserDescribe = (): Mocha.Suite =>
  describe('Helper parser', () => {
    it('should parse helpers correctly', () => {
      const cases: [string, any, string?][] = [
        [
          '@helperFunction(anotherToken:symbol(), "this is a string param", 10e18)',
          {
            type: 'HelperFunctionExpression',
            name: { type: 'Identifier', value: 'helperFunction' },
            args: [
              {
                type: 'CallExpression',
                target: { type: 'Identifier', value: 'anotherToken' },
                callee: { type: 'Identifier', value: 'symbol' },
                args: [],
              },
              { type: 'StringLiteral', value: 'this is a string param' },
              { type: 'NumberLiteral', value: '10e18' },
            ],
          },
          'invalid helper with call expression match',
        ],
        [
          `@token("WETH")`,
          {
            type: 'HelperFunctionExpression',
            name: { type: 'Identifier', value: 'token' },
            args: [{ type: 'StringLiteral', value: 'WETH' }],
          },
          'invalid helper match',
        ],
        [
          `@now`,
          {
            type: 'HelperFunctionExpression',
            name: { type: 'Identifier', value: 'now' },
            args: [],
          },
          'invalid helper without args match',
        ],
        [
          `@token('DAI', @calc(34, @innerHelper(true)))`,
          {
            type: 'HelperFunctionExpression',
            name: { type: 'Identifier', value: 'token' },
            args: [
              { type: 'StringLiteral', value: 'DAI' },
              {
                type: 'HelperFunctionExpression',
                name: { type: 'Identifier', value: 'calc' },
                args: [
                  { type: 'NumberLiteral', value: '34' },
                  {
                    type: 'HelperFunctionExpression',
                    name: { type: 'Identifier', value: 'innerHelper' },
                    args: [{ type: 'BoolLiteral', value: 'true' }],
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
