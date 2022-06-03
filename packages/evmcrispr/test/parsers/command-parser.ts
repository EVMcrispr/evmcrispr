import { commandExpressionParser } from '../../src/cas11/parsers/command';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

export const commandParserDescribe = (): Mocha.Suite =>
  describe('Command parser', () => {
    it('should parse commands', () => {
      const cases: Case[] = [
        [
          `   install wrapper-hooked-token-manager 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0   `,
          {
            type: 'CommandExpression',
            name: { type: 'Identifier', value: 'install' },
            args: [
              { type: 'Identifier', value: 'wrapper-hooked-token-manager' },
              {
                type: 'AddressLiteral',
                value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
              },
              { type: 'BoolLiteral', value: 'false' },
              { type: 'NumberLiteral', value: '0' },
            ],
          },
        ],
      ];

      runCases(cases, commandExpressionParser);
    });

    it('should parse system commands', () => {
      const cases: Case[] = [
        [
          'load superfluid',
          {
            type: 'CommandExpression',
            name: { type: 'Identifier', value: 'load' },
            args: [{ type: 'Identifier', value: 'superfluid' }],
          },
          'invalid `load` command match',
        ],
        [
          'load aragonos as ar',
          {
            type: 'CommandExpression',
            name: { type: 'Identifier', value: 'load' },
            args: [
              {
                type: 'AsExpression',
                left: { type: 'Identifier', value: 'aragonos' },
                right: { type: 'Identifier', value: 'ar' },
              },
            ],
          },
        ],
        [
          `switch gnosis`,
          {
            type: 'CommandExpression',
            name: { type: 'Identifier', value: 'switch' },
            args: [{ type: 'Identifier', value: 'gnosis' }],
          },
          'invalid `switch` command match',
        ],
        [
          `set $new-variable 'a variable'`,
          {
            type: 'CommandExpression',
            name: { type: 'Identifier', value: 'set' },
            args: [
              { type: 'VariableIdentifier', value: '$new-variable' },
              { type: 'StringLiteral', value: 'a variable' },
            ],
          },
          'invalid `set` command match',
        ],
      ];

      runCases(cases, commandExpressionParser);
    });
  });
