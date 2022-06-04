import { callExpressionParser } from '../../src/cas11/parsers/call';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

export const callParserDescribe = (): Mocha.Suite =>
  describe('Call parsers', () => {
    it('should parse call expressions correctly', () => {
      const cases: Case[] = [
        [
          `0x14FA5C16Af56190239B997485656F5c8b4f86c4b:getEntry(0, @token("WETH"))`,
          {
            type: 'CallExpression',
            target: {
              type: 'AddressLiteral',
              value: '0x14FA5C16Af56190239B997485656F5c8b4f86c4b',
            },
            callee: { type: 'Identifier', value: 'getEntry' },
            args: [
              { type: 'NumberLiteral', value: 0 },
              {
                type: 'HelperFunctionExpression',
                name: { type: 'Identifier', value: 'token' },
                args: [{ type: 'StringLiteral', value: 'WETH' }],
              },
            ],
          },
        ],
        [
          `superfluid:createFlow(@token("DAIx"), finance:vault(), 10e18m, 'this is a nice description')`,
          {
            type: 'CallExpression',
            target: { type: 'Identifier', value: 'superfluid' },
            callee: { type: 'Identifier', value: 'createFlow' },
            args: [
              {
                type: 'HelperFunctionExpression',
                name: { type: 'Identifier', value: 'token' },
                args: [{ type: 'StringLiteral', value: 'DAIx' }],
              },
              {
                type: 'CallExpression',
                target: { type: 'Identifier', value: 'finance' },
                callee: { type: 'Identifier', value: 'vault' },
                args: [],
              },
              { type: 'NumberLiteral', value: 10, power: 18, timeUnit: 'm' },
              { type: 'StringLiteral', value: 'this is a nice description' },
            ],
          },
          'invalid nested call expression',
        ],
      ];

      runCases(cases, callExpressionParser);
    });
  });
