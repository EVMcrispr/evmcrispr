import { commandExpressionParser } from '../../src/cas11/parsers/command';
import type { CommandExpressionNode } from '../../src/cas11/types';
import { NodeType } from '../../src/cas11/types';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

const {
  AddressLiteral,
  BoolLiteral,
  NumberLiteral,
  ProbableIdentifier,
  CommandExpression,
  CommandIdentifier,
} = NodeType;

export const commandParserDescribe = (): Mocha.Suite =>
  describe('Command parser', () => {
    it('should parse a command correctly', () => {
      const c: Case = [
        'my-command @ipfs("upload this to ipfs") contract:getData("param1", false, an-identifier, @me) anotherIdentifier.open',
        {
          type: 'CommandExpression',
          name: { type: 'CommandIdentifier', value: 'my-command' },
          args: [
            {
              type: 'HelperFunctionExpression',
              name: { type: 'StringLiteral', value: 'ipfs' },
              args: [{ type: 'StringLiteral', value: 'upload this to ipfs' }],
            },
            {
              type: 'CallExpression',
              target: { type: 'ProbableIdentifier', value: 'contract' },
              callee: { type: 'StringLiteral', value: 'getData' },
              args: [
                { type: 'StringLiteral', value: 'param1' },
                { type: 'BoolLiteral', value: false },
                { type: 'ProbableIdentifier', value: 'an-identifier' },
                {
                  type: 'HelperFunctionExpression',
                  name: { type: 'StringLiteral', value: 'me' },
                  args: [],
                },
              ],
            },
            { type: 'ProbableIdentifier', value: 'anotherIdentifier.open' },
          ],
        },
      ];

      runCases(c, commandExpressionParser);
    });

    it('should parse a command with trailing whitespaces', () => {
      const expectedCommandNode: CommandExpressionNode = {
        type: CommandExpression,
        name: { type: CommandIdentifier, value: 'install' },
        args: [
          { type: ProbableIdentifier, value: 'wrapper-hooked-token-manager' },
          {
            type: AddressLiteral,
            value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
          },
          { type: BoolLiteral, value: false },
          { type: NumberLiteral, value: 0 },
        ],
      };
      const command = `install wrapper-hooked-token-manager 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0`;

      const cases: Case[] = [
        [
          `${command}    `,
          expectedCommandNode,
          'invalid command match with right whitespaces',
        ],
        [
          `   ${command}`,
          expectedCommandNode,
          'invalid command match with left whitespaces',
        ],
        [
          `${command.slice(0, 7)}       ${command.slice(7, command.length)}`,
          expectedCommandNode,
          'invalid command match with in-between whitespaces',
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
            name: { type: 'CommandIdentifier', value: 'load' },
            args: [{ type: 'ProbableIdentifier', value: 'superfluid' }],
          },
          'invalid `load` command match',
        ],
        [
          'load aragonos as ar',
          {
            type: 'CommandExpression',
            name: { type: 'CommandIdentifier', value: 'load' },
            args: [
              {
                type: 'AsExpression',
                left: { type: 'ProbableIdentifier', value: 'aragonos' },
                right: { type: 'ProbableIdentifier', value: 'ar' },
              },
            ],
          },
        ],
        [
          `switch gnosis`,
          {
            type: 'CommandExpression',
            name: { type: 'CommandIdentifier', value: 'switch' },
            args: [{ type: 'ProbableIdentifier', value: 'gnosis' }],
          },
          'invalid `switch` command match',
        ],
        [
          `set $new-variable 'a variable'`,
          {
            type: 'CommandExpression',
            name: { type: 'CommandIdentifier', value: 'set' },
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

    it('should parse commands followed by block expressions', () => {
      const c: Case = [
        `forward token-manager voting agent (
          set $agent $finance:vault()
          forward wrappable-token-manager.open disputable-voting.open agent (
            sf:batchcall (
              flow create @token(fDAIx) $agent 1e18mo
            )
          )
        )`,
        {
          type: 'CommandExpression',
          name: { type: 'CommandIdentifier', value: 'forward' },
          args: [
            { type: 'ProbableIdentifier', value: 'token-manager' },
            { type: 'ProbableIdentifier', value: 'voting' },
            { type: 'ProbableIdentifier', value: 'agent' },
            {
              type: 'BlockExpression',
              body: [
                {
                  type: 'CommandExpression',
                  name: { type: 'CommandIdentifier', value: 'set' },
                  args: [
                    { type: 'VariableIdentifier', value: '$agent' },
                    {
                      type: 'CallExpression',
                      target: { type: 'VariableIdentifier', value: '$finance' },
                      callee: { type: 'StringLiteral', value: 'vault' },
                      args: [],
                    },
                  ],
                },
                {
                  type: 'CommandExpression',
                  name: { type: 'CommandIdentifier', value: 'forward' },
                  args: [
                    {
                      type: 'ProbableIdentifier',
                      value: 'wrappable-token-manager.open',
                    },
                    {
                      type: 'ProbableIdentifier',
                      value: 'disputable-voting.open',
                    },
                    { type: 'ProbableIdentifier', value: 'agent' },
                    {
                      type: 'BlockExpression',
                      body: [
                        {
                          type: 'CommandExpression',
                          name: {
                            type: 'CommandIdentifier',
                            module: 'sf',
                            value: 'batchcall',
                          },
                          args: [
                            {
                              type: 'BlockExpression',
                              body: [
                                {
                                  type: 'CommandExpression',
                                  name: {
                                    type: 'CommandIdentifier',
                                    value: 'flow',
                                  },
                                  args: [
                                    {
                                      type: 'ProbableIdentifier',
                                      value: 'create',
                                    },
                                    {
                                      type: 'HelperFunctionExpression',
                                      name: {
                                        type: 'StringLiteral',
                                        value: 'token',
                                      },
                                      args: [
                                        {
                                          type: 'ProbableIdentifier',
                                          value: 'fDAIx',
                                        },
                                      ],
                                    },
                                    {
                                      type: 'VariableIdentifier',
                                      value: '$agent',
                                    },
                                    {
                                      type: 'NumberLiteral',
                                      value: 1,
                                      power: 18,
                                      timeUnit: 'mo',
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      runCases(c, commandExpressionParser);
    });
  });
