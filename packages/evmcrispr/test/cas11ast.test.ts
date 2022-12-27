import { DAO, DAO2, DAO3 } from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';

import type { Cas11AST } from '../src/Cas11AST';
import { parseScript } from '../src/parsers/script';

describe('Cas11AST', () => {
  const script = `
    load aragonos as ar
    load giveth as giv

    ar:connect ${DAO.kernel} (
      set $dao1Variable agent
      connect ${DAO2.kernel} (
        set $dao2Variable vault
        install vault:new
      )
    )

    ar:connect ${DAO3} (
      revoke voting token-manager MINT_ROLE
    )

    set $globalScopeVariable "test"
  `;
  let ast: Cas11AST;

  beforeEach(() => {
    ast = parseScript(script).ast;
  });

  describe('when fetching a command at a specific line', () => {
    it('should fetch it correctly', () => {
      expect(ast.getCommandAtLine(9)).to.eql({
        type: 'CommandExpression',
        name: 'install',
        args: [
          {
            type: 'ProbableIdentifier',
            value: 'vault:new',
            loc: { start: { line: 9, col: 16 }, end: { line: 9, col: 25 } },
          },
        ],
        opts: [],
        loc: { start: { line: 9, col: 8 }, end: { line: 9, col: 25 } },
      });
    });

    it('should return nothing when given a line higher than the maximum script line', () => {
      expect(ast.getCommandAtLine(30)).to.be.undefined;
    });

    it('should return nothing when given an empty line', () => {
      expect(ast.getCommandAtLine(4)).to.be.undefined;
    });

    it('should return nothing when given a line without a command', () => {
      expect(ast.getCommandAtLine(10)).to.be.undefined;
    });
  });

  describe('when fetching commands until a specific line', () => {
    it('should fetch them correctly', () => {
      expect(ast.getCommandsUntilLine(12)).to.eql([
        {
          type: 'CommandExpression',
          name: 'load',
          args: [
            {
              type: 'AsExpression',
              left: {
                type: 'ProbableIdentifier',
                value: 'aragonos',
                loc: { start: { line: 2, col: 9 }, end: { line: 2, col: 17 } },
              },
              right: {
                type: 'ProbableIdentifier',
                value: 'ar',
                loc: { start: { line: 2, col: 21 }, end: { line: 2, col: 23 } },
              },
              loc: { start: { line: 2, col: 9 }, end: { line: 2, col: 23 } },
            },
          ],
          opts: [],
          loc: { start: { line: 2, col: 4 }, end: { line: 2, col: 23 } },
        },
        {
          type: 'CommandExpression',
          name: 'load',
          args: [
            {
              type: 'AsExpression',
              left: {
                type: 'ProbableIdentifier',
                value: 'giveth',
                loc: { start: { line: 3, col: 9 }, end: { line: 3, col: 15 } },
              },
              right: {
                type: 'ProbableIdentifier',
                value: 'giv',
                loc: { start: { line: 3, col: 19 }, end: { line: 3, col: 22 } },
              },
              loc: { start: { line: 3, col: 9 }, end: { line: 3, col: 22 } },
            },
          ],
          opts: [],
          loc: { start: { line: 3, col: 4 }, end: { line: 3, col: 22 } },
        },
        {
          type: 'CommandExpression',
          module: 'ar',
          name: 'connect',
          args: [
            {
              type: 'AddressLiteral',
              value: '0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8',
              loc: { start: { line: 5, col: 15 }, end: { line: 5, col: 57 } },
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
                      value: '$dao1Variable',
                      loc: {
                        start: { line: 6, col: 10 },
                        end: { line: 6, col: 23 },
                      },
                    },
                    {
                      type: 'ProbableIdentifier',
                      value: 'agent',
                      loc: {
                        start: { line: 6, col: 24 },
                        end: { line: 6, col: 29 },
                      },
                    },
                  ],
                  opts: [],
                  loc: {
                    start: { line: 6, col: 6 },
                    end: { line: 6, col: 29 },
                  },
                },
                {
                  type: 'CommandExpression',
                  name: 'connect',
                  args: [
                    {
                      type: 'AddressLiteral',
                      value: '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155',
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
                          name: 'set',
                          args: [
                            {
                              type: 'VariableIdentifier',
                              value: '$dao2Variable',
                              loc: {
                                start: { line: 8, col: 12 },
                                end: { line: 8, col: 25 },
                              },
                            },
                            {
                              type: 'ProbableIdentifier',
                              value: 'vault',
                              loc: {
                                start: { line: 8, col: 26 },
                                end: { line: 8, col: 31 },
                              },
                            },
                          ],
                          opts: [],
                          loc: {
                            start: { line: 8, col: 8 },
                            end: { line: 8, col: 31 },
                          },
                        },
                        {
                          type: 'CommandExpression',
                          name: 'install',
                          args: [
                            {
                              type: 'ProbableIdentifier',
                              value: 'vault:new',
                              loc: {
                                start: { line: 9, col: 16 },
                                end: { line: 9, col: 25 },
                              },
                            },
                          ],
                          opts: [],
                          loc: {
                            start: { line: 9, col: 8 },
                            end: { line: 9, col: 25 },
                          },
                        },
                      ],
                      loc: {
                        start: { line: 7, col: 57 },
                        end: { line: 10, col: 7 },
                      },
                    },
                  ],
                  opts: [],
                  loc: {
                    start: { line: 7, col: 6 },
                    end: { line: 10, col: 7 },
                  },
                },
              ],
              loc: { start: { line: 5, col: 58 }, end: { line: 11, col: 5 } },
            },
          ],
          opts: [],
          loc: { start: { line: 5, col: 4 }, end: { line: 11, col: 5 } },
        },
      ]);
    });
    describe('when given a set of global scope command names', () => {
      it('should fetch them correctly', () => {
        expect(ast.getCommandsUntilLine(9, ['load', 'set'])).to.eql([
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
          {
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
          {
            type: 'CommandExpression',
            module: 'ar',
            name: 'connect',
            args: [
              {
                type: 'AddressLiteral',
                value: '0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8',
                loc: { start: { line: 5, col: 15 }, end: { line: 5, col: 57 } },
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
                        value: '$dao1Variable',
                        loc: {
                          start: { line: 6, col: 10 },
                          end: { line: 6, col: 23 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'agent',
                        loc: {
                          start: { line: 6, col: 24 },
                          end: { line: 6, col: 29 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 6, col: 6 },
                      end: { line: 6, col: 29 },
                    },
                  },
                  {
                    type: 'CommandExpression',
                    name: 'connect',
                    args: [
                      {
                        type: 'AddressLiteral',
                        value: '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155',
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
                            name: 'set',
                            args: [
                              {
                                type: 'VariableIdentifier',
                                value: '$dao2Variable',
                                loc: {
                                  start: { line: 8, col: 12 },
                                  end: { line: 8, col: 25 },
                                },
                              },
                              {
                                type: 'ProbableIdentifier',
                                value: 'vault',
                                loc: {
                                  start: { line: 8, col: 26 },
                                  end: { line: 8, col: 31 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 8, col: 8 },
                              end: { line: 8, col: 31 },
                            },
                          },
                          {
                            type: 'CommandExpression',
                            name: 'install',
                            args: [
                              {
                                type: 'ProbableIdentifier',
                                value: 'vault:new',
                                loc: {
                                  start: { line: 9, col: 16 },
                                  end: { line: 9, col: 25 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 9, col: 8 },
                              end: { line: 9, col: 25 },
                            },
                          },
                        ],
                        loc: {
                          start: { line: 7, col: 57 },
                          end: { line: 10, col: 7 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 7, col: 6 },
                      end: { line: 10, col: 7 },
                    },
                  },
                ],
                loc: { start: { line: 5, col: 58 }, end: { line: 11, col: 5 } },
              },
            ],
            opts: [],
            loc: { start: { line: 5, col: 4 }, end: { line: 11, col: 5 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$dao1Variable',
                loc: { start: { line: 6, col: 10 }, end: { line: 6, col: 23 } },
              },
              {
                type: 'ProbableIdentifier',
                value: 'agent',
                loc: { start: { line: 6, col: 24 }, end: { line: 6, col: 29 } },
              },
            ],
            opts: [],
            loc: { start: { line: 6, col: 6 }, end: { line: 6, col: 29 } },
          },
          {
            type: 'CommandExpression',
            name: 'connect',
            args: [
              {
                type: 'AddressLiteral',
                value: '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155',
                loc: { start: { line: 7, col: 14 }, end: { line: 7, col: 56 } },
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
                        value: '$dao2Variable',
                        loc: {
                          start: { line: 8, col: 12 },
                          end: { line: 8, col: 25 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'vault',
                        loc: {
                          start: { line: 8, col: 26 },
                          end: { line: 8, col: 31 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 8, col: 8 },
                      end: { line: 8, col: 31 },
                    },
                  },
                  {
                    type: 'CommandExpression',
                    name: 'install',
                    args: [
                      {
                        type: 'ProbableIdentifier',
                        value: 'vault:new',
                        loc: {
                          start: { line: 9, col: 16 },
                          end: { line: 9, col: 25 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 9, col: 8 },
                      end: { line: 9, col: 25 },
                    },
                  },
                ],
                loc: { start: { line: 7, col: 57 }, end: { line: 10, col: 7 } },
              },
            ],
            opts: [],
            loc: { start: { line: 7, col: 6 }, end: { line: 10, col: 7 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$dao2Variable',
                loc: { start: { line: 8, col: 12 }, end: { line: 8, col: 25 } },
              },
              {
                type: 'ProbableIdentifier',
                value: 'vault',
                loc: { start: { line: 8, col: 26 }, end: { line: 8, col: 31 } },
              },
            ],
            opts: [],
            loc: { start: { line: 8, col: 8 }, end: { line: 8, col: 31 } },
          },
          {
            type: 'CommandExpression',
            name: 'install',
            args: [
              {
                type: 'ProbableIdentifier',
                value: 'vault:new',
                loc: { start: { line: 9, col: 16 }, end: { line: 9, col: 25 } },
              },
            ],
            opts: [],
            loc: { start: { line: 9, col: 8 }, end: { line: 9, col: 25 } },
          },
        ]);
      });

      it('should fetch them correctly when giving a line higher than the maximum script line', () => {
        expect(ast.getCommandsUntilLine(200, ['load', 'set'])).to.eql([
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
          {
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
          {
            type: 'CommandExpression',
            module: 'ar',
            name: 'connect',
            args: [
              {
                type: 'AddressLiteral',
                value: '0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8',
                loc: { start: { line: 5, col: 15 }, end: { line: 5, col: 57 } },
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
                        value: '$dao1Variable',
                        loc: {
                          start: { line: 6, col: 10 },
                          end: { line: 6, col: 23 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'agent',
                        loc: {
                          start: { line: 6, col: 24 },
                          end: { line: 6, col: 29 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 6, col: 6 },
                      end: { line: 6, col: 29 },
                    },
                  },
                  {
                    type: 'CommandExpression',
                    name: 'connect',
                    args: [
                      {
                        type: 'AddressLiteral',
                        value: '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155',
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
                            name: 'set',
                            args: [
                              {
                                type: 'VariableIdentifier',
                                value: '$dao2Variable',
                                loc: {
                                  start: { line: 8, col: 12 },
                                  end: { line: 8, col: 25 },
                                },
                              },
                              {
                                type: 'ProbableIdentifier',
                                value: 'vault',
                                loc: {
                                  start: { line: 8, col: 26 },
                                  end: { line: 8, col: 31 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 8, col: 8 },
                              end: { line: 8, col: 31 },
                            },
                          },
                          {
                            type: 'CommandExpression',
                            name: 'install',
                            args: [
                              {
                                type: 'ProbableIdentifier',
                                value: 'vault:new',
                                loc: {
                                  start: { line: 9, col: 16 },
                                  end: { line: 9, col: 25 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 9, col: 8 },
                              end: { line: 9, col: 25 },
                            },
                          },
                        ],
                        loc: {
                          start: { line: 7, col: 57 },
                          end: { line: 10, col: 7 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 7, col: 6 },
                      end: { line: 10, col: 7 },
                    },
                  },
                ],
                loc: { start: { line: 5, col: 58 }, end: { line: 11, col: 5 } },
              },
            ],
            opts: [],
            loc: { start: { line: 5, col: 4 }, end: { line: 11, col: 5 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$dao1Variable',
                loc: { start: { line: 6, col: 10 }, end: { line: 6, col: 23 } },
              },
              {
                type: 'ProbableIdentifier',
                value: 'agent',
                loc: { start: { line: 6, col: 24 }, end: { line: 6, col: 29 } },
              },
            ],
            opts: [],
            loc: { start: { line: 6, col: 6 }, end: { line: 6, col: 29 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$dao2Variable',
                loc: { start: { line: 8, col: 12 }, end: { line: 8, col: 25 } },
              },
              {
                type: 'ProbableIdentifier',
                value: 'vault',
                loc: { start: { line: 8, col: 26 }, end: { line: 8, col: 31 } },
              },
            ],
            opts: [],
            loc: { start: { line: 8, col: 8 }, end: { line: 8, col: 31 } },
          },
          {
            type: 'CommandExpression',
            module: 'ar',
            name: 'connect',
            args: [
              {
                type: 'BlockExpression',
                body: [
                  {
                    type: 'CommandExpression',
                    name: 'revoke',
                    args: [
                      {
                        type: 'ProbableIdentifier',
                        value: 'voting',
                        loc: {
                          start: { line: 14, col: 13 },
                          end: { line: 14, col: 19 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'token-manager',
                        loc: {
                          start: { line: 14, col: 20 },
                          end: { line: 14, col: 33 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'MINT_ROLE',
                        loc: {
                          start: { line: 14, col: 34 },
                          end: { line: 14, col: 43 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 14, col: 6 },
                      end: { line: 14, col: 43 },
                    },
                  },
                ],
                loc: {
                  start: { line: 13, col: 31 },
                  end: { line: 15, col: 5 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 13, col: 4 }, end: { line: 15, col: 5 } },
          },
          {
            type: 'CommandExpression',
            name: 'set',
            args: [
              {
                type: 'VariableIdentifier',
                value: '$globalScopeVariable',
                loc: {
                  start: { line: 17, col: 8 },
                  end: { line: 17, col: 28 },
                },
              },
              {
                type: 'StringLiteral',
                value: 'test',
                loc: {
                  start: { line: 17, col: 29 },
                  end: { line: 17, col: 35 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 17, col: 4 }, end: { line: 17, col: 35 } },
          },
        ]);
      });
    });
  });
});
