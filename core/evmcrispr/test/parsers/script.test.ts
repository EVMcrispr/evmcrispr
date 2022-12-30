import type { Case } from '@1hive/evmcrispr-test-common';
import { runCases } from '@1hive/evmcrispr-test-common';

import { scriptParser } from '../../src/parsers/script';

describe('Parsers - script', () => {
  it('should parse an script correctly', () => {
    const script = `
      load aragonos as ar
      load superfluid as sf\r\n
      
      ar:connect my-dao-ens (   
        forward token-manager voting      (
          install wrapper-hooked-token-manager.open 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0
        
        
        )     




        forward token-manager voting agent (
          
          set $agent finance::vault()

          forward wrappable-token-manager.open disputable-voting.open agent (
            set $daix @token("fDAIx")







            
            sf:token approve @token('DAI') @me 15.45e18


            sf:batchcall (
              token upgrade $daix 4500.43e18
              flow create $daix $agent 1e18mo
              token downgrade @token('USDCx')
            )


          )
          
          
        ) 
        
        
                          )
  
  
      
      `;

    const c: Case = [
      script,
      {
        type: 'Program',
        body: [
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
                    start: { line: 2, col: 11 },
                    end: { line: 2, col: 19 },
                  },
                },
                right: {
                  type: 'ProbableIdentifier',
                  value: 'ar',
                  loc: {
                    start: { line: 2, col: 23 },
                    end: { line: 2, col: 25 },
                  },
                },
                loc: {
                  start: { line: 2, col: 11 },
                  end: { line: 2, col: 25 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 2, col: 6 }, end: { line: 2, col: 25 } },
          },
          {
            type: 'CommandExpression',
            name: 'load',
            args: [
              {
                type: 'AsExpression',
                left: {
                  type: 'ProbableIdentifier',
                  value: 'superfluid',
                  loc: {
                    start: { line: 3, col: 11 },
                    end: { line: 3, col: 21 },
                  },
                },
                right: {
                  type: 'ProbableIdentifier',
                  value: 'sf',
                  loc: {
                    start: { line: 3, col: 25 },
                    end: { line: 3, col: 27 },
                  },
                },
                loc: {
                  start: { line: 3, col: 11 },
                  end: { line: 3, col: 27 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 3, col: 6 }, end: { line: 3, col: 27 } },
          },
          {
            type: 'CommandExpression',
            module: 'ar',
            name: 'connect',
            args: [
              {
                type: 'ProbableIdentifier',
                value: 'my-dao-ens',
                loc: {
                  start: { line: 6, col: 17 },
                  end: { line: 6, col: 27 },
                },
              },
              {
                type: 'BlockExpression',
                body: [
                  {
                    type: 'CommandExpression',
                    name: 'forward',
                    args: [
                      {
                        type: 'ProbableIdentifier',
                        value: 'token-manager',
                        loc: {
                          start: { line: 7, col: 16 },
                          end: { line: 7, col: 29 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'voting',
                        loc: {
                          start: { line: 7, col: 30 },
                          end: { line: 7, col: 36 },
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
                                value: 'wrapper-hooked-token-manager.open',
                                loc: {
                                  start: { line: 8, col: 18 },
                                  end: { line: 8, col: 51 },
                                },
                              },
                              {
                                type: 'AddressLiteral',
                                value:
                                  '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
                                loc: {
                                  start: { line: 8, col: 52 },
                                  end: { line: 8, col: 94 },
                                },
                              },
                              {
                                type: 'BoolLiteral',
                                value: false,
                                loc: {
                                  start: { line: 8, col: 95 },
                                  end: { line: 8, col: 100 },
                                },
                              },
                              {
                                type: 'NumberLiteral',
                                value: '0',
                                loc: {
                                  start: { line: 8, col: 101 },
                                  end: { line: 8, col: 102 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 8, col: 10 },
                              end: { line: 8, col: 102 },
                            },
                          },
                        ],
                        loc: {
                          start: { line: 7, col: 42 },
                          end: { line: 11, col: 9 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 7, col: 8 },
                      end: { line: 11, col: 9 },
                    },
                  },
                  {
                    type: 'CommandExpression',
                    name: 'forward',
                    args: [
                      {
                        type: 'ProbableIdentifier',
                        value: 'token-manager',
                        loc: {
                          start: { line: 16, col: 16 },
                          end: { line: 16, col: 29 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'voting',
                        loc: {
                          start: { line: 16, col: 30 },
                          end: { line: 16, col: 36 },
                        },
                      },
                      {
                        type: 'ProbableIdentifier',
                        value: 'agent',
                        loc: {
                          start: { line: 16, col: 37 },
                          end: { line: 16, col: 42 },
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
                                value: '$agent',
                                loc: {
                                  start: { line: 18, col: 14 },
                                  end: { line: 18, col: 20 },
                                },
                              },
                              {
                                type: 'CallExpression',
                                target: {
                                  type: 'ProbableIdentifier',
                                  value: 'finance',
                                  loc: {
                                    start: { line: 18, col: 21 },
                                    end: { line: 18, col: 28 },
                                  },
                                },
                                method: 'vault',
                                args: [],
                                loc: {
                                  start: { line: 18, col: 21 },
                                  end: { line: 18, col: 37 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 18, col: 10 },
                              end: { line: 18, col: 37 },
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
                                  start: { line: 20, col: 18 },
                                  end: { line: 20, col: 46 },
                                },
                              },
                              {
                                type: 'ProbableIdentifier',
                                value: 'disputable-voting.open',
                                loc: {
                                  start: { line: 20, col: 47 },
                                  end: { line: 20, col: 69 },
                                },
                              },
                              {
                                type: 'ProbableIdentifier',
                                value: 'agent',
                                loc: {
                                  start: { line: 20, col: 70 },
                                  end: { line: 20, col: 75 },
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
                                        value: '$daix',
                                        loc: {
                                          start: { line: 21, col: 16 },
                                          end: { line: 21, col: 21 },
                                        },
                                      },
                                      {
                                        type: 'HelperFunctionExpression',
                                        name: 'token',
                                        args: [
                                          {
                                            type: 'StringLiteral',
                                            value: 'fDAIx',
                                            loc: {
                                              start: { line: 21, col: 29 },
                                              end: { line: 21, col: 36 },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: { line: 21, col: 22 },
                                          end: { line: 21, col: 37 },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: { line: 21, col: 12 },
                                      end: { line: 21, col: 37 },
                                    },
                                  },
                                  {
                                    type: 'CommandExpression',
                                    module: 'sf',
                                    name: 'token',
                                    args: [
                                      {
                                        type: 'ProbableIdentifier',
                                        value: 'approve',
                                        loc: {
                                          start: { line: 30, col: 21 },
                                          end: { line: 30, col: 28 },
                                        },
                                      },
                                      {
                                        type: 'HelperFunctionExpression',
                                        name: 'token',
                                        args: [
                                          {
                                            type: 'StringLiteral',
                                            value: 'DAI',
                                            loc: {
                                              start: { line: 30, col: 36 },
                                              end: { line: 30, col: 41 },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: { line: 30, col: 29 },
                                          end: { line: 30, col: 42 },
                                        },
                                      },
                                      {
                                        type: 'HelperFunctionExpression',
                                        name: 'me',
                                        args: [],
                                        loc: {
                                          start: { line: 30, col: 43 },
                                          end: { line: 30, col: 46 },
                                        },
                                      },
                                      {
                                        type: 'NumberLiteral',
                                        value: '15.45',
                                        power: 18,
                                        loc: {
                                          start: { line: 30, col: 47 },
                                          end: { line: 30, col: 55 },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: { line: 30, col: 12 },
                                      end: { line: 30, col: 55 },
                                    },
                                  },
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
                                            name: 'token',
                                            args: [
                                              {
                                                type: 'ProbableIdentifier',
                                                value: 'upgrade',
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 20,
                                                  },
                                                  end: { line: 34, col: 27 },
                                                },
                                              },
                                              {
                                                type: 'VariableIdentifier',
                                                value: '$daix',
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 28,
                                                  },
                                                  end: { line: 34, col: 33 },
                                                },
                                              },
                                              {
                                                type: 'NumberLiteral',
                                                value: '4500.43',
                                                power: 18,
                                                loc: {
                                                  start: {
                                                    line: 34,
                                                    col: 34,
                                                  },
                                                  end: { line: 34, col: 44 },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: { line: 34, col: 14 },
                                              end: { line: 34, col: 44 },
                                            },
                                          },
                                          {
                                            type: 'CommandExpression',
                                            name: 'flow',
                                            args: [
                                              {
                                                type: 'ProbableIdentifier',
                                                value: 'create',
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 19,
                                                  },
                                                  end: { line: 35, col: 25 },
                                                },
                                              },
                                              {
                                                type: 'VariableIdentifier',
                                                value: '$daix',
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 26,
                                                  },
                                                  end: { line: 35, col: 31 },
                                                },
                                              },
                                              {
                                                type: 'VariableIdentifier',
                                                value: '$agent',
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 32,
                                                  },
                                                  end: { line: 35, col: 38 },
                                                },
                                              },
                                              {
                                                type: 'NumberLiteral',
                                                value: '1',
                                                power: 18,
                                                timeUnit: 'mo',
                                                loc: {
                                                  start: {
                                                    line: 35,
                                                    col: 39,
                                                  },
                                                  end: { line: 35, col: 45 },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: { line: 35, col: 14 },
                                              end: { line: 35, col: 45 },
                                            },
                                          },
                                          {
                                            type: 'CommandExpression',
                                            name: 'token',
                                            args: [
                                              {
                                                type: 'ProbableIdentifier',
                                                value: 'downgrade',
                                                loc: {
                                                  start: {
                                                    line: 36,
                                                    col: 20,
                                                  },
                                                  end: { line: 36, col: 29 },
                                                },
                                              },
                                              {
                                                type: 'HelperFunctionExpression',
                                                name: 'token',
                                                args: [
                                                  {
                                                    type: 'StringLiteral',
                                                    value: 'USDCx',
                                                    loc: {
                                                      start: {
                                                        line: 36,
                                                        col: 37,
                                                      },
                                                      end: {
                                                        line: 36,
                                                        col: 44,
                                                      },
                                                    },
                                                  },
                                                ],
                                                loc: {
                                                  start: {
                                                    line: 36,
                                                    col: 30,
                                                  },
                                                  end: { line: 36, col: 45 },
                                                },
                                              },
                                            ],
                                            opts: [],
                                            loc: {
                                              start: { line: 36, col: 14 },
                                              end: { line: 36, col: 45 },
                                            },
                                          },
                                        ],
                                        loc: {
                                          start: { line: 33, col: 25 },
                                          end: { line: 37, col: 13 },
                                        },
                                      },
                                    ],
                                    opts: [],
                                    loc: {
                                      start: { line: 33, col: 12 },
                                      end: { line: 37, col: 13 },
                                    },
                                  },
                                ],
                                loc: {
                                  start: { line: 20, col: 76 },
                                  end: { line: 40, col: 11 },
                                },
                              },
                            ],
                            opts: [],
                            loc: {
                              start: { line: 20, col: 10 },
                              end: { line: 40, col: 11 },
                            },
                          },
                        ],
                        loc: {
                          start: { line: 16, col: 43 },
                          end: { line: 43, col: 9 },
                        },
                      },
                    ],
                    opts: [],
                    loc: {
                      start: { line: 16, col: 8 },
                      end: { line: 43, col: 9 },
                    },
                  },
                ],
                loc: {
                  start: { line: 6, col: 28 },
                  end: { line: 46, col: 27 },
                },
              },
            ],
            opts: [],
            loc: { start: { line: 6, col: 6 }, end: { line: 46, col: 27 } },
          },
        ],
      },
    ];
    runCases(c, scriptParser);
  });
});
