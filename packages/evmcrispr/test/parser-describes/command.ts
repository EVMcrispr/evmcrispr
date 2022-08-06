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
} = NodeType;

export const commandParserDescribe = (): Mocha.Suite =>
  describe('Command parser', () => {
    it('should parse a command correctly', () => {
      const cases: Case[] = [
        [
          'my-command @ipfs("upload this to ipfs") contract::getData("param1", false, an-identifier, @me) anotherIdentifier.open',
          {
            type: 'CommandExpression',
            name: 'my-command',
            args: [
              {
                type: 'HelperFunctionExpression',
                name: 'ipfs',
                args: [{ type: 'StringLiteral', value: 'upload this to ipfs' }],
              },
              {
                type: 'CallExpression',
                target: { type: 'ProbableIdentifier', value: 'contract' },
                method: 'getData',
                args: [
                  { type: 'StringLiteral', value: 'param1' },
                  { type: 'BoolLiteral', value: false },
                  { type: 'ProbableIdentifier', value: 'an-identifier' },
                  {
                    type: 'HelperFunctionExpression',
                    name: 'me',
                    args: [],
                  },
                ],
              },
              { type: 'ProbableIdentifier', value: 'anotherIdentifier.open' },
            ],
            opts: [],
          },
        ],
        [
          'load superfluid',
          {
            type: 'CommandExpression',
            name: 'load',
            args: [{ type: 'ProbableIdentifier', value: 'superfluid' }],
            opts: [],
          },
          'invalid `load` command match',
        ],
        [
          'load aragonos as ar',
          {
            type: 'CommandExpression',
            name: 'load',
            args: [
              {
                type: 'AsExpression',
                left: { type: 'ProbableIdentifier', value: 'aragonos' },
                right: { type: 'ProbableIdentifier', value: 'ar' },
              },
            ],
            opts: [],
          },
        ],
        [
          `switch gnosis`,
          {
            type: 'CommandExpression',
            name: 'switch',
            args: [{ type: 'ProbableIdentifier', value: 'gnosis' }],
            opts: [],
          },
          'invalid `switch` command match',
        ],
        [
          `set $new-variable 'a variable'`,
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              { type: 'VariableIdentifier', value: '$new-variable' },
              { type: 'StringLiteral', value: 'a variable' },
            ],
            opts: [],
          },
          'invalid `set` command match',
        ],
      ];

      runCases(cases, commandExpressionParser);
    });

    it('should parse a command with opt args correctly', async () => {
      const c: Case = [
        'example-command myArg1 125.23e18 @aHelper(contract::getSomething(), false) "text" --option1 optionValue --something-else @token(DAI) --anotherOne 1e18',
        {
          type: 'CommandExpression',
          name: 'example-command',
          args: [
            { type: 'ProbableIdentifier', value: 'myArg1' },
            { type: 'NumberLiteral', value: 125.23, power: 18 },
            {
              type: 'HelperFunctionExpression',
              name: 'aHelper',
              args: [
                {
                  type: 'CallExpression',
                  target: { type: 'ProbableIdentifier', value: 'contract' },
                  method: 'getSomething',
                  args: [],
                },
                { type: 'BoolLiteral', value: false },
              ],
            },
            { type: 'StringLiteral', value: 'text' },
          ],
          opts: [
            {
              type: 'CommandOpt',
              name: 'option1',
              value: { type: 'ProbableIdentifier', value: 'optionValue' },
            },
            {
              type: 'CommandOpt',
              name: 'something-else',
              value: {
                type: 'HelperFunctionExpression',
                name: 'token',
                args: [{ type: 'ProbableIdentifier', value: 'DAI' }],
              },
            },
            {
              type: 'CommandOpt',
              name: 'anotherOne',
              value: { type: 'NumberLiteral', value: 1, power: 18 },
            },
          ],
        },
      ];

      runCases(c, commandExpressionParser);
    });

    it('should parse a command with in-between opt args', () => {
      const c: Case = [
        `exec 0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374 --inBetween a::getInfo() 1e18 --another-one @token.balance(GIV, @me) @token(DAI, "see") (
          inside-command @me --t "testing" 25e16
          another-ne token-manager:0 superfluid.open:3 --default true
        ) --lastOne false`,
        {
          type: 'CommandExpression',
          name: 'exec',
          args: [
            {
              type: 'AddressLiteral',
              value: '0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374',
            },
            { type: 'NumberLiteral', value: 1, power: 18 },
            {
              type: 'HelperFunctionExpression',
              name: 'token',
              args: [
                { type: 'ProbableIdentifier', value: 'DAI' },
                { type: 'StringLiteral', value: 'see' },
              ],
            },
            {
              type: 'BlockExpression',
              body: [
                {
                  type: 'CommandExpression',
                  name: 'inside-command',
                  args: [
                    {
                      type: 'HelperFunctionExpression',
                      name: 'me',
                      args: [],
                    },
                    { type: 'NumberLiteral', value: 25, power: 16 },
                  ],
                  opts: [
                    {
                      type: 'CommandOpt',
                      name: 't',
                      value: { type: 'StringLiteral', value: 'testing' },
                    },
                  ],
                },
                {
                  type: 'CommandExpression',
                  name: 'another-ne',
                  args: [
                    { type: 'ProbableIdentifier', value: 'token-manager:0' },
                    {
                      type: 'ProbableIdentifier',
                      value: 'superfluid.open:3',
                    },
                  ],
                  opts: [
                    {
                      type: 'CommandOpt',
                      name: 'default',
                      value: { type: 'BoolLiteral', value: true },
                    },
                  ],
                },
              ],
            },
          ],
          opts: [
            {
              type: 'CommandOpt',
              name: 'inBetween',
              value: {
                type: 'CallExpression',
                target: { type: 'ProbableIdentifier', value: 'a' },
                method: 'getInfo',
                args: [],
              },
            },
            {
              type: 'CommandOpt',
              name: 'another-one',
              value: {
                type: 'HelperFunctionExpression',
                name: 'token.balance',
                args: [
                  { type: 'ProbableIdentifier', value: 'GIV' },
                  {
                    type: 'HelperFunctionExpression',
                    name: 'me',
                    args: [],
                  },
                ],
              },
            },
            {
              type: 'CommandOpt',
              name: 'lastOne',
              value: { type: 'BoolLiteral', value: false },
            },
          ],
        },
      ];

      runCases(c, commandExpressionParser);
    });

    it('should parse a command with trailing whitespaces', () => {
      const expectedCommandNode: CommandExpressionNode = {
        type: CommandExpression,
        name: 'install',
        args: [
          { type: ProbableIdentifier, value: 'wrapper-hooked-token-manager' },
          {
            type: AddressLiteral,
            value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
          },
          { type: BoolLiteral, value: false },
          { type: NumberLiteral, value: 0 },
        ],
        opts: [],
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

    it('should parse commands followed by block expressions', () => {
      const c: Case = [
        `forward token-manager voting agent (
          set $agent $finance::vault()
          forward wrappable-token-manager.open disputable-voting.open agent (
            sf:batchcall (
              flow create @token(fDAIx) $agent 1e18mo
            )
          )
        )`,
        {
          type: 'CommandExpression',
          name: 'forward',
          args: [
            { type: 'ProbableIdentifier', value: 'token-manager' },
            { type: 'ProbableIdentifier', value: 'voting' },
            { type: 'ProbableIdentifier', value: 'agent' },
            {
              type: 'BlockExpression',
              body: [
                {
                  type: 'CommandExpression',
                  name: 'set',
                  args: [
                    { type: 'VariableIdentifier', value: '$agent' },
                    {
                      type: 'CallExpression',
                      target: { type: 'VariableIdentifier', value: '$finance' },
                      method: 'vault',
                      args: [],
                    },
                  ],
                  opts: [],
                },
                {
                  type: 'CommandExpression',
                  name: 'forward',
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
                          module: 'sf',
                          name: 'batchcall',
                          args: [
                            {
                              type: 'BlockExpression',
                              body: [
                                {
                                  type: 'CommandExpression',
                                  name: 'flow',
                                  args: [
                                    {
                                      type: 'ProbableIdentifier',
                                      value: 'create',
                                    },
                                    {
                                      type: 'HelperFunctionExpression',
                                      name: 'token',
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
                                  opts: [],
                                },
                              ],
                            },
                          ],
                          opts: [],
                        },
                      ],
                    },
                  ],
                  opts: [],
                },
              ],
            },
          ],
          opts: [],
        },
      ];

      runCases(c, commandExpressionParser);
    });
  });
