import { expect } from 'chai';

import type { Cas11AST } from '../src/Cas11AST';
import { parseScript } from '../src/parsers/script';

import { DAO, DAO2 } from './fixtures';

describe('Cas11AST', () => {
  const script = `
    load aragonos as ar
    load giveth as giv

    ar:connect ${DAO.kernel} (
      set $myAgent agent
      connect ${DAO2.kernel} (
        install vault:new
      )
    )
  `;
  let ast: Cas11AST;

  beforeEach(() => {
    ast = parseScript(script).ast;
  });

  describe('when fetching a command at a specific line', () => {
    it('should fetch it correctly', () => {
      expect(ast.getCommandAtLine(8)).to.eql({
        node: {
          type: 'CommandExpression',
          name: 'install',
          args: [
            {
              type: 'ProbableIdentifier',
              value: 'vault:new',
              loc: { start: { line: 8, col: 16 }, end: { line: 8, col: 25 } },
            },
          ],
          opts: [],
          loc: { start: { line: 8, col: 8 }, end: { line: 8, col: 25 } },
        },
        parent: {
          node: {
            type: 'CommandExpression',
            name: 'connect',
            args: [
              {
                type: 'AddressLiteral',
                value: '0xb2a22974bd09eb5d1b5c726e7c29f4faef636dd2',
                loc: { start: { line: 7, col: 14 }, end: { line: 7, col: 56 } },
              },
              {
                type: 'BlockExpression',
                body: [
                  {
                    type: 'CommandExpression',
                    name: 'install',
                    args: [
                      {
                        type: 'ProbableIdentifier',
                        value: 'vault:new',
                        loc: {
                          start: { line: 8, col: 16 },
                          end: { line: 8, col: 25 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 8, col: 8 },
                      end: { line: 8, col: 25 },
                    },
                  },
                ],
                loc: { start: { line: 7, col: 57 }, end: { line: 9, col: 7 } },
              },
            ],
            opts: [],
            loc: { start: { line: 7, col: 6 }, end: { line: 9, col: 7 } },
          },
          parent: {
            node: {
              type: 'CommandExpression',
              module: 'ar',
              name: 'connect',
              args: [
                {
                  type: 'AddressLiteral',
                  value: '0x8bebd1c49336bf491ef7bd8a7f9a5d267081b33e',
                  loc: {
                    start: { line: 5, col: 15 },
                    end: { line: 5, col: 57 },
                  },
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
                          value: '$myAgent',
                          loc: {
                            start: { line: 6, col: 10 },
                            end: { line: 6, col: 18 },
                          },
                        },
                        {
                          type: 'ProbableIdentifier',
                          value: 'agent',
                          loc: {
                            start: { line: 6, col: 19 },
                            end: { line: 6, col: 24 },
                          },
                        },
                      ],
                      opts: [],
                      loc: {
                        start: { line: 6, col: 6 },
                        end: { line: 6, col: 24 },
                      },
                    },
                    {
                      type: 'CommandExpression',
                      name: 'connect',
                      args: [
                        {
                          type: 'AddressLiteral',
                          value: '0xb2a22974bd09eb5d1b5c726e7c29f4faef636dd2',
                          loc: {
                            start: { line: 7, col: 14 },
                            end: { line: 7, col: 56 },
                          },
                        },
                        {
                          type: 'BlockExpression',
                          body: [
                            {
                              type: 'CommandExpression',
                              name: 'install',
                              args: [
                                {
                                  type: 'ProbableIdentifier',
                                  value: 'vault:new',
                                  loc: {
                                    start: { line: 8, col: 16 },
                                    end: { line: 8, col: 25 },
                                  },
                                },
                              ],
                              opts: [],
                              loc: {
                                start: { line: 8, col: 8 },
                                end: { line: 8, col: 25 },
                              },
                            },
                          ],
                          loc: {
                            start: { line: 7, col: 57 },
                            end: { line: 9, col: 7 },
                          },
                        },
                      ],
                      opts: [],
                      loc: {
                        start: { line: 7, col: 6 },
                        end: { line: 9, col: 7 },
                      },
                    },
                  ],
                  loc: {
                    start: { line: 5, col: 58 },
                    end: { line: 10, col: 5 },
                  },
                },
              ],
              opts: [],
              loc: { start: { line: 5, col: 4 }, end: { line: 10, col: 5 } },
            },
            parent: undefined,
          },
        },
      });
    });

    it('should return nothing when given a line higher than the maximum script line', () => {
      expect(ast.getCommandAtLine(15)).to.be.undefined;
    });

    it('should return nothing when given an empty line', () => {
      expect(ast.getCommandAtLine(4)).to.be.undefined;
    });

    it('should return nothing when given a line without a command', () => {
      expect(ast.getCommandAtLine(9)).to.be.undefined;
    });
  });

  describe('when fetching commands given a set of names', () => {
    const expectedCommands = [
      {
        node: {
          type: 'CommandExpression',
          name: 'load',
          args: [
            {
              type: 'AsExpression',
              left: {
                type: 'ProbableIdentifier',
                value: 'aragonos',
                loc: {
                  start: { line: 2, col: 9 },
                  end: { line: 2, col: 17 },
                },
              },
              right: {
                type: 'ProbableIdentifier',
                value: 'ar',
                loc: {
                  start: { line: 2, col: 21 },
                  end: { line: 2, col: 23 },
                },
              },
              loc: { start: { line: 2, col: 9 }, end: { line: 2, col: 23 } },
            },
          ],
          opts: [],
          loc: { start: { line: 2, col: 4 }, end: { line: 2, col: 23 } },
        },
        parent: undefined,
      },
      {
        node: {
          type: 'CommandExpression',
          name: 'load',
          args: [
            {
              type: 'AsExpression',
              left: {
                type: 'ProbableIdentifier',
                value: 'giveth',
                loc: {
                  start: { line: 3, col: 9 },
                  end: { line: 3, col: 15 },
                },
              },
              right: {
                type: 'ProbableIdentifier',
                value: 'giv',
                loc: {
                  start: { line: 3, col: 19 },
                  end: { line: 3, col: 22 },
                },
              },
              loc: { start: { line: 3, col: 9 }, end: { line: 3, col: 22 } },
            },
          ],
          opts: [],
          loc: { start: { line: 3, col: 4 }, end: { line: 3, col: 22 } },
        },
        parent: undefined,
      },
      {
        node: {
          type: 'CommandExpression',
          name: 'set',
          args: [
            {
              type: 'VariableIdentifier',
              value: '$myAgent',
              loc: { start: { line: 6, col: 10 }, end: { line: 6, col: 18 } },
            },
            {
              type: 'ProbableIdentifier',
              value: 'agent',
              loc: { start: { line: 6, col: 19 }, end: { line: 6, col: 24 } },
            },
          ],
          opts: [],
          loc: { start: { line: 6, col: 6 }, end: { line: 6, col: 24 } },
        },
        parent: {
          node: {
            type: 'CommandExpression',
            module: 'ar',
            name: 'connect',
            args: [
              {
                type: 'AddressLiteral',
                value: '0x8bebd1c49336bf491ef7bd8a7f9a5d267081b33e',
                loc: {
                  start: { line: 5, col: 15 },
                  end: { line: 5, col: 57 },
                },
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
                        value: '$myAgent',
                        loc: {
                          start: { line: 6, col: 10 },
                          end: { line: 6, col: 18 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'agent',
                        loc: {
                          start: { line: 6, col: 19 },
                          end: { line: 6, col: 24 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 6, col: 6 },
                      end: { line: 6, col: 24 },
                    },
                  },
                  {
                    type: 'CommandExpression',
                    name: 'connect',
                    args: [
                      {
                        type: 'AddressLiteral',
                        value: '0xb2a22974bd09eb5d1b5c726e7c29f4faef636dd2',
                        loc: {
                          start: { line: 7, col: 14 },
                          end: { line: 7, col: 56 },
                        },
                      },
                      {
                        type: 'BlockExpression',
                        body: [
                          {
                            type: 'CommandExpression',
                            name: 'install',
                            args: [
                              {
                                type: 'ProbableIdentifier',
                                value: 'vault:new',
                                loc: {
                                  start: { line: 8, col: 16 },
                                  end: { line: 8, col: 25 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 8, col: 8 },
                              end: { line: 8, col: 25 },
                            },
                          },
                        ],
                        loc: {
                          start: { line: 7, col: 57 },
                          end: { line: 9, col: 7 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 7, col: 6 },
                      end: { line: 9, col: 7 },
                    },
                  },
                ],
                loc: {
                  start: { line: 5, col: 58 },
                  end: { line: 10, col: 5 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 5, col: 4 }, end: { line: 10, col: 5 } },
          },
          parent: undefined,
        },
      },
    ];

    it('should fetch them correctly', () => {
      expect(ast.getCommandsUntilLine(['load', 'set'], 8)).eql(
        expectedCommands,
      );
    });

    it('should fetch them correctly when giving a line higher than the maximum script line', () => {
      expect(ast.getCommandsUntilLine(['load', 'set'], 200)).eql(
        expectedCommands,
      );
    });
  });
});
