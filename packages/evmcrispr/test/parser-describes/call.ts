import { callExpressionParser } from '../../src/cas11/parsers/call';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

export const callParserDescribe = (): Mocha.Suite =>
  describe('Call parsers', () => {
    it('should parse call expressions correctly', () => {
      const cases: Case[] = [
        [
          `0x14FA5C16Af56190239B997485656F5c8b4f86c4b:getEntry(0, @token(WETH))`,
          {
            type: 'CallExpression',
            target: {
              type: 'AddressLiteral',
              value: '0x14FA5C16Af56190239B997485656F5c8b4f86c4b',
            },
            callee: { type: 'StringLiteral', value: 'getEntry' },
            args: [
              { type: 'NumberLiteral', value: 0 },
              {
                type: 'HelperFunctionExpression',
                name: { type: 'StringLiteral', value: 'token' },
                args: [{ type: 'ProbableIdentifier', value: 'WETH' }],
              },
            ],
          },
        ],
        [
          `$superfluid:createFlow(@token("DAIx"), $finance:vault([1,2,3]), $contract:method(), 10e18m, 'this is a nice description')`,
          {
            type: 'CallExpression',
            target: { type: 'VariableIdentifier', value: '$superfluid' },
            callee: { type: 'StringLiteral', value: 'createFlow' },
            args: [
              {
                type: 'HelperFunctionExpression',
                name: { type: 'StringLiteral', value: 'token' },
                args: [{ type: 'StringLiteral', value: 'DAIx' }],
              },
              {
                type: 'CallExpression',
                target: { type: 'VariableIdentifier', value: '$finance' },
                callee: { type: 'StringLiteral', value: 'vault' },
                args: [
                  {
                    elements: [
                      {
                        type: 'NumberLiteral',
                        value: 1,
                      },
                      {
                        type: 'NumberLiteral',
                        value: 2,
                      },
                      {
                        type: 'NumberLiteral',
                        value: 3,
                      },
                    ],
                    type: 'ArrayExpression',
                  },
                ],
              },
              {
                type: 'CallExpression',
                callee: {
                  type: 'StringLiteral',
                  value: 'method',
                },
                target: {
                  type: 'VariableIdentifier',
                  value: '$contract',
                },
                args: [],
              },
              { type: 'NumberLiteral', value: 10, power: 18, timeUnit: 'm' },
              {
                type: 'StringLiteral',
                value: 'this is a nice description',
              },
            ],
          },
          'invalid nested call expression',
        ],
        [
          `@token(DAIx):upgrade(@token(DAI), 1800e18)`,
          {
            type: 'CallExpression',
            target: {
              type: 'HelperFunctionExpression',
              name: { type: 'StringLiteral', value: 'token' },
              args: [{ type: 'ProbableIdentifier', value: 'DAIx' }],
            },
            callee: { type: 'StringLiteral', value: 'upgrade' },
            args: [
              {
                type: 'HelperFunctionExpression',
                name: { type: 'StringLiteral', value: 'token' },
                args: [{ type: 'ProbableIdentifier', value: 'DAI' }],
              },
              { type: 'NumberLiteral', value: 1800, power: 18 },
            ],
          },
          'invalid helper call expression',
        ],
        [
          `$registryContract:getToken(1):approve(@me, 560.25e18):another()`,
          {
            type: 'CallExpression',
            target: {
              type: 'CallExpression',
              target: {
                type: 'CallExpression',
                target: {
                  type: 'VariableIdentifier',
                  value: '$registryContract',
                },
                callee: { type: 'StringLiteral', value: 'getToken' },
                args: [{ type: 'NumberLiteral', value: 1 }],
              },
              callee: { type: 'StringLiteral', value: 'approve' },
              args: [
                {
                  type: 'HelperFunctionExpression',
                  name: { type: 'StringLiteral', value: 'me' },
                  args: [],
                },
                { type: 'NumberLiteral', value: 560.25, power: 18 },
              ],
            },
            callee: { type: 'StringLiteral', value: 'another' },
            args: [],
          },
          'invalid recursive call expression',
        ],
      ];

      runCases(cases, callExpressionParser);
    });
  });
