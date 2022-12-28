import type { Case } from '@1hive/evmcrispr-test-common';
import { runCases, runErrorCase } from '@1hive/evmcrispr-test-common';

import {
  COMMAND_PARSER_ERROR,
  commandExpressionParser,
  commandOptParser,
} from '../../src/parsers/command';

describe('Parsers - command expression', () => {
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
              args: [
                {
                  type: 'StringLiteral',
                  value: 'upload this to ipfs',
                  loc: {
                    start: { line: 1, col: 17 },
                    end: { line: 1, col: 38 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 11 }, end: { line: 1, col: 39 } },
            },
            {
              type: 'CallExpression',
              target: {
                type: 'ProbableIdentifier',
                value: 'contract',
                loc: {
                  start: { line: 1, col: 40 },
                  end: { line: 1, col: 48 },
                },
              },
              method: 'getData',
              args: [
                {
                  type: 'StringLiteral',
                  value: 'param1',
                  loc: {
                    start: { line: 1, col: 58 },
                    end: { line: 1, col: 66 },
                  },
                },
                {
                  type: 'BoolLiteral',
                  value: false,
                  loc: {
                    start: { line: 1, col: 68 },
                    end: { line: 1, col: 73 },
                  },
                },
                {
                  type: 'ProbableIdentifier',
                  value: 'an-identifier',
                  loc: {
                    start: { line: 1, col: 75 },
                    end: { line: 1, col: 88 },
                  },
                },
                {
                  type: 'HelperFunctionExpression',
                  name: 'me',
                  args: [],
                  loc: {
                    start: { line: 1, col: 90 },
                    end: { line: 1, col: 93 },
                  },
                },
              ],
              loc: { start: { line: 1, col: 40 }, end: { line: 1, col: 94 } },
            },
            {
              type: 'ProbableIdentifier',
              value: 'anotherIdentifier.open',
              loc: {
                start: { line: 1, col: 95 },
                end: { line: 1, col: 117 },
              },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 117 } },
        },
      ],
      [
        'load superfluid',
        {
          type: 'CommandExpression',
          name: 'load',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'superfluid',
              loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 15 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 15 } },
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
              left: {
                type: 'ProbableIdentifier',
                value: 'aragonos',
                loc: {
                  start: { line: 1, col: 5 },
                  end: { line: 1, col: 13 },
                },
              },
              right: {
                type: 'ProbableIdentifier',
                value: 'ar',
                loc: {
                  start: { line: 1, col: 17 },
                  end: { line: 1, col: 19 },
                },
              },
              loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 19 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 19 } },
        },
      ],
      [
        `switch gnosis`,
        {
          type: 'CommandExpression',
          name: 'switch',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'gnosis',
              loc: { start: { line: 1, col: 7 }, end: { line: 1, col: 13 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 13 } },
        },
        'invalid `switch` command match',
      ],
      [
        `set $new-variable 'a variable'`,
        {
          type: 'CommandExpression',
          name: 'set',
          args: [
            {
              type: 'VariableIdentifier',
              value: '$new-variable',
              loc: { start: { line: 1, col: 4 }, end: { line: 1, col: 17 } },
            },
            {
              type: 'StringLiteral',
              value: 'a variable',
              loc: { start: { line: 1, col: 18 }, end: { line: 1, col: 30 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 30 } },
        },
        'invalid `set` command match',
      ],
      [
        `mod:no-arg-command`,
        {
          type: 'CommandExpression',
          module: 'mod',
          name: 'no-arg-command',
          args: [],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 18 } },
        },
        'invalid command without args match',
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
          {
            type: 'ProbableIdentifier',
            value: 'myArg1',
            loc: { start: { line: 1, col: 16 }, end: { line: 1, col: 22 } },
          },
          {
            type: 'NumberLiteral',
            value: '125.23',
            power: 18,
            loc: { start: { line: 1, col: 23 }, end: { line: 1, col: 32 } },
          },
          {
            type: 'HelperFunctionExpression',
            name: 'aHelper',
            args: [
              {
                type: 'CallExpression',
                target: {
                  type: 'ProbableIdentifier',
                  value: 'contract',
                  loc: {
                    start: { line: 1, col: 42 },
                    end: { line: 1, col: 50 },
                  },
                },
                method: 'getSomething',
                args: [],
                loc: {
                  start: { line: 1, col: 42 },
                  end: { line: 1, col: 66 },
                },
              },
              {
                type: 'BoolLiteral',
                value: false,
                loc: {
                  start: { line: 1, col: 68 },
                  end: { line: 1, col: 73 },
                },
              },
            ],
            loc: { start: { line: 1, col: 33 }, end: { line: 1, col: 74 } },
          },
          {
            type: 'StringLiteral',
            value: 'text',
            loc: { start: { line: 1, col: 75 }, end: { line: 1, col: 81 } },
          },
        ],
        opts: [
          {
            type: 'CommandOpt',
            name: 'option1',
            value: {
              type: 'ProbableIdentifier',
              value: 'optionValue',
              loc: {
                start: { line: 1, col: 92 },
                end: { line: 1, col: 103 },
              },
            },
            loc: { start: { line: 1, col: 82 }, end: { line: 1, col: 103 } },
          },
          {
            type: 'CommandOpt',
            name: 'something-else',
            value: {
              type: 'HelperFunctionExpression',
              name: 'token',
              args: [
                {
                  type: 'ProbableIdentifier',
                  value: 'DAI',
                  loc: {
                    start: { line: 1, col: 128 },
                    end: { line: 1, col: 131 },
                  },
                },
              ],
              loc: {
                start: { line: 1, col: 121 },
                end: { line: 1, col: 132 },
              },
            },
            loc: { start: { line: 1, col: 104 }, end: { line: 1, col: 132 } },
          },
          {
            type: 'CommandOpt',
            name: 'anotherOne',
            value: {
              type: 'NumberLiteral',
              value: '1',
              power: 18,
              loc: {
                start: { line: 1, col: 146 },
                end: { line: 1, col: 150 },
              },
            },
            loc: { start: { line: 1, col: 133 }, end: { line: 1, col: 150 } },
          },
        ],
        loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 150 } },
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
            loc: { start: { line: 1, col: 5 }, end: { line: 1, col: 47 } },
          },
          {
            type: 'NumberLiteral',
            value: '1',
            power: 18,
            loc: { start: { line: 1, col: 73 }, end: { line: 1, col: 77 } },
          },
          {
            type: 'HelperFunctionExpression',
            name: 'token',
            args: [
              {
                type: 'ProbableIdentifier',
                value: 'DAI',
                loc: {
                  start: { line: 1, col: 124 },
                  end: { line: 1, col: 127 },
                },
              },
              {
                type: 'StringLiteral',
                value: 'see',
                loc: {
                  start: { line: 1, col: 129 },
                  end: { line: 1, col: 134 },
                },
              },
            ],
            loc: { start: { line: 1, col: 117 }, end: { line: 1, col: 135 } },
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
                    loc: {
                      start: { line: 2, col: 25 },
                      end: { line: 2, col: 28 },
                    },
                  },
                  {
                    type: 'NumberLiteral',
                    value: '25',
                    power: 16,
                    loc: {
                      start: { line: 2, col: 43 },
                      end: { line: 2, col: 48 },
                    },
                  },
                ],
                opts: [
                  {
                    type: 'CommandOpt',
                    name: 't',
                    value: {
                      type: 'StringLiteral',
                      value: 'testing',
                      loc: {
                        start: { line: 2, col: 33 },
                        end: { line: 2, col: 42 },
                      },
                    },
                    loc: {
                      start: { line: 2, col: 29 },
                      end: { line: 2, col: 42 },
                    },
                  },
                ],
                loc: {
                  start: { line: 2, col: 10 },
                  end: { line: 2, col: 48 },
                },
              },
              {
                type: 'CommandExpression',
                name: 'another-ne',
                args: [
                  {
                    type: 'ProbableIdentifier',
                    value: 'token-manager:0',
                    loc: {
                      start: { line: 3, col: 21 },
                      end: { line: 3, col: 36 },
                    },
                  },
                  {
                    type: 'ProbableIdentifier',
                    value: 'superfluid.open:3',
                    loc: {
                      start: { line: 3, col: 37 },
                      end: { line: 3, col: 54 },
                    },
                  },
                ],
                opts: [
                  {
                    type: 'CommandOpt',
                    name: 'default',
                    value: {
                      type: 'BoolLiteral',
                      value: true,
                      loc: {
                        start: { line: 3, col: 65 },
                        end: { line: 3, col: 69 },
                      },
                    },
                    loc: {
                      start: { line: 3, col: 55 },
                      end: { line: 3, col: 69 },
                    },
                  },
                ],
                loc: {
                  start: { line: 3, col: 10 },
                  end: { line: 3, col: 69 },
                },
              },
            ],
            loc: { start: { line: 1, col: 136 }, end: { line: 4, col: 9 } },
          },
        ],
        opts: [
          {
            type: 'CommandOpt',
            name: 'inBetween',
            value: {
              type: 'CallExpression',
              target: {
                type: 'ProbableIdentifier',
                value: 'a',
                loc: {
                  start: { line: 1, col: 60 },
                  end: { line: 1, col: 61 },
                },
              },
              method: 'getInfo',
              args: [],
              loc: { start: { line: 1, col: 60 }, end: { line: 1, col: 72 } },
            },
            loc: { start: { line: 1, col: 48 }, end: { line: 1, col: 72 } },
          },
          {
            type: 'CommandOpt',
            name: 'another-one',
            value: {
              type: 'HelperFunctionExpression',
              name: 'token.balance',
              args: [
                {
                  type: 'ProbableIdentifier',
                  value: 'GIV',
                  loc: {
                    start: { line: 1, col: 107 },
                    end: { line: 1, col: 110 },
                  },
                },
                {
                  type: 'HelperFunctionExpression',
                  name: 'me',
                  args: [],
                  loc: {
                    start: { line: 1, col: 112 },
                    end: { line: 1, col: 115 },
                  },
                },
              ],
              loc: {
                start: { line: 1, col: 92 },
                end: { line: 1, col: 116 },
              },
            },
            loc: { start: { line: 1, col: 78 }, end: { line: 1, col: 116 } },
          },
          {
            type: 'CommandOpt',
            name: 'lastOne',
            value: {
              type: 'BoolLiteral',
              value: false,
              loc: { start: { line: 4, col: 20 }, end: { line: 4, col: 25 } },
            },
            loc: { start: { line: 4, col: 10 }, end: { line: 4, col: 25 } },
          },
        ],
        loc: { start: { line: 1, col: 0 }, end: { line: 4, col: 25 } },
      },
    ];

    runCases(c, commandExpressionParser);
  });

  it('should parse a command with trailing whitespaces', () => {
    const command = `install wrapper-hooked-token-manager 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0`;

    const cases: Case[] = [
      [
        `${command}    `,
        {
          type: 'CommandExpression',
          name: 'install',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'wrapper-hooked-token-manager',
              loc: { start: { line: 1, col: 8 }, end: { line: 1, col: 36 } },
            },
            {
              type: 'AddressLiteral',
              value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
              loc: { start: { line: 1, col: 37 }, end: { line: 1, col: 79 } },
            },
            {
              type: 'BoolLiteral',
              value: false,
              loc: { start: { line: 1, col: 80 }, end: { line: 1, col: 85 } },
            },
            {
              type: 'NumberLiteral',
              value: '0',
              loc: { start: { line: 1, col: 86 }, end: { line: 1, col: 87 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 87 } },
        },
        'invalid command match with right whitespaces',
      ],
      [
        `   ${command}`,
        {
          type: 'CommandExpression',
          name: 'install',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'wrapper-hooked-token-manager',
              loc: { start: { line: 1, col: 11 }, end: { line: 1, col: 39 } },
            },
            {
              type: 'AddressLiteral',
              value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
              loc: { start: { line: 1, col: 40 }, end: { line: 1, col: 82 } },
            },
            {
              type: 'BoolLiteral',
              value: false,
              loc: { start: { line: 1, col: 83 }, end: { line: 1, col: 88 } },
            },
            {
              type: 'NumberLiteral',
              value: '0',
              loc: { start: { line: 1, col: 89 }, end: { line: 1, col: 90 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 3 }, end: { line: 1, col: 90 } },
        },
        'invalid command match with left whitespaces',
      ],
      [
        `${command.slice(0, 7)}       ${command.slice(7, command.length)}`,
        {
          type: 'CommandExpression',
          name: 'install',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'wrapper-hooked-token-manager',
              loc: { start: { line: 1, col: 15 }, end: { line: 1, col: 43 } },
            },
            {
              type: 'AddressLiteral',
              value: '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
              loc: { start: { line: 1, col: 44 }, end: { line: 1, col: 86 } },
            },
            {
              type: 'BoolLiteral',
              value: false,
              loc: { start: { line: 1, col: 87 }, end: { line: 1, col: 92 } },
            },
            {
              type: 'NumberLiteral',
              value: '0',
              loc: { start: { line: 1, col: 93 }, end: { line: 1, col: 94 } },
            },
          ],
          opts: [],
          loc: { start: { line: 1, col: 0 }, end: { line: 1, col: 94 } },
        },
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
          {
            type: 'ProbableIdentifier',
            value: 'token-manager',
            loc: { start: { line: 1, col: 8 }, end: { line: 1, col: 21 } },
          },
          {
            type: 'ProbableIdentifier',
            value: 'voting',
            loc: { start: { line: 1, col: 22 }, end: { line: 1, col: 28 } },
          },
          {
            type: 'ProbableIdentifier',
            value: 'agent',
            loc: { start: { line: 1, col: 29 }, end: { line: 1, col: 34 } },
          },
          {
            type: 'BlockExpression',
            body: [
              {
                type: 'CommandExpression',
                name: 'set',
                args: [
                  {
                    type: 'VariableIdentifier',
                    value: '$agent',
                    loc: {
                      start: { line: 2, col: 14 },
                      end: { line: 2, col: 20 },
                    },
                  },
                  {
                    type: 'CallExpression',
                    target: {
                      type: 'VariableIdentifier',
                      value: '$finance',
                      loc: {
                        start: { line: 2, col: 21 },
                        end: { line: 2, col: 29 },
                      },
                    },
                    method: 'vault',
                    args: [],
                    loc: {
                      start: { line: 2, col: 21 },
                      end: { line: 2, col: 38 },
                    },
                  },
                ],
                opts: [],
                loc: {
                  start: { line: 2, col: 10 },
                  end: { line: 2, col: 38 },
                },
              },
              {
                type: 'CommandExpression',
                name: 'forward',
                args: [
                  {
                    type: 'ProbableIdentifier',
                    value: 'wrappable-token-manager.open',
                    loc: {
                      start: { line: 3, col: 18 },
                      end: { line: 3, col: 46 },
                    },
                  },
                  {
                    type: 'ProbableIdentifier',
                    value: 'disputable-voting.open',
                    loc: {
                      start: { line: 3, col: 47 },
                      end: { line: 3, col: 69 },
                    },
                  },
                  {
                    type: 'ProbableIdentifier',
                    value: 'agent',
                    loc: {
                      start: { line: 3, col: 70 },
                      end: { line: 3, col: 75 },
                    },
                  },
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
                                    loc: {
                                      start: { line: 5, col: 19 },
                                      end: { line: 5, col: 25 },
                                    },
                                  },
                                  {
                                    type: 'HelperFunctionExpression',
                                    name: 'token',
                                    args: [
                                      {
                                        type: 'ProbableIdentifier',
                                        value: 'fDAIx',
                                        loc: {
                                          start: { line: 5, col: 33 },
                                          end: { line: 5, col: 38 },
                                        },
                                      },
                                    ],
                                    loc: {
                                      start: { line: 5, col: 26 },
                                      end: { line: 5, col: 39 },
                                    },
                                  },
                                  {
                                    type: 'VariableIdentifier',
                                    value: '$agent',
                                    loc: {
                                      start: { line: 5, col: 40 },
                                      end: { line: 5, col: 46 },
                                    },
                                  },
                                  {
                                    type: 'NumberLiteral',
                                    value: '1',
                                    power: 18,
                                    timeUnit: 'mo',
                                    loc: {
                                      start: { line: 5, col: 47 },
                                      end: { line: 5, col: 53 },
                                    },
                                  },
                                ],
                                opts: [],
                                loc: {
                                  start: { line: 5, col: 14 },
                                  end: { line: 5, col: 53 },
                                },
                              },
                            ],
                            loc: {
                              start: { line: 4, col: 25 },
                              end: { line: 6, col: 13 },
                            },
                          },
                        ],
                        opts: [],
                        loc: {
                          start: { line: 4, col: 12 },
                          end: { line: 6, col: 13 },
                        },
                      },
                    ],
                    loc: {
                      start: { line: 3, col: 76 },
                      end: { line: 7, col: 11 },
                    },
                  },
                ],
                opts: [],
                loc: {
                  start: { line: 3, col: 10 },
                  end: { line: 7, col: 11 },
                },
              },
            ],
            loc: { start: { line: 1, col: 35 }, end: { line: 8, col: 9 } },
          },
        ],
        opts: [],
        loc: { start: { line: 1, col: 0 }, end: { line: 8, col: 9 } },
      },
    ];

    runCases(c, commandExpressionParser);
  });

  it('should fail when parsing an invalid module name', () => {
    runErrorCase(commandExpressionParser, 'asda2345:asd', COMMAND_PARSER_ERROR);
  });

  it('should fail when parsing an incomplete command name', () => {
    runErrorCase(
      commandExpressionParser,
      'my-command:',
      COMMAND_PARSER_ERROR,
      'Expecting a valid command name',
    );
  });

  it('should fail when parsing an invalid command name', () => {
    runErrorCase(
      commandExpressionParser,
      'my-command:wer234',
      COMMAND_PARSER_ERROR,
      'Expecting a valid command name',
    );
  });

  it('should fail when parsing an invalid opt name', () => {
    runErrorCase(
      commandOptParser,
      '--asd$ asd',
      COMMAND_PARSER_ERROR,
      'Expecting a valid option name',
    );
  });
});
