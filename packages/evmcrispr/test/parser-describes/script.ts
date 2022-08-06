import { scriptParser } from '../../src/cas11/parsers/script';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

export const scriptParserDescribe = (): Mocha.Suite =>
  describe('Script parser', () => {
    it('should parse an script correctly', () => {
      const script = `
      load aragonos as ar
      load superfluid as sf
  
      
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
                  left: { type: 'ProbableIdentifier', value: 'aragonos' },
                  right: { type: 'ProbableIdentifier', value: 'ar' },
                },
              ],
              opts: [],
            },
            {
              type: 'CommandExpression',
              name: 'load',
              args: [
                {
                  type: 'AsExpression',
                  left: { type: 'ProbableIdentifier', value: 'superfluid' },
                  right: { type: 'ProbableIdentifier', value: 'sf' },
                },
              ],
              opts: [],
            },
            {
              type: 'CommandExpression',
              module: 'ar',
              name: 'connect',
              args: [
                { type: 'ProbableIdentifier', value: 'my-dao-ens' },
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
                        },
                        { type: 'ProbableIdentifier', value: 'voting' },
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
                                },
                                {
                                  type: 'AddressLiteral',
                                  value:
                                    '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
                                },
                                { type: 'BoolLiteral', value: false },
                                { type: 'NumberLiteral', value: 0 },
                              ],
                              opts: [],
                            },
                          ],
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
                          value: 'token-manager',
                        },
                        { type: 'ProbableIdentifier', value: 'voting' },
                        { type: 'ProbableIdentifier', value: 'agent' },
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
                                },
                                {
                                  type: 'CallExpression',
                                  target: {
                                    type: 'ProbableIdentifier',
                                    value: 'finance',
                                  },
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
                                {
                                  type: 'ProbableIdentifier',
                                  value: 'agent',
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
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: 'token',
                                          args: [
                                            {
                                              type: 'StringLiteral',
                                              value: 'fDAIx',
                                            },
                                          ],
                                        },
                                      ],
                                      opts: [],
                                    },
                                    {
                                      type: 'CommandExpression',
                                      module: 'sf',
                                      name: 'token',
                                      args: [
                                        {
                                          type: 'ProbableIdentifier',
                                          value: 'approve',
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: 'token',
                                          args: [
                                            {
                                              type: 'StringLiteral',
                                              value: 'DAI',
                                            },
                                          ],
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: 'me',
                                          args: [],
                                        },
                                        {
                                          type: 'NumberLiteral',
                                          value: 15.45,
                                          power: 18,
                                        },
                                      ],
                                      opts: [],
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
                                                },
                                                {
                                                  type: 'VariableIdentifier',
                                                  value: '$daix',
                                                },
                                                {
                                                  type: 'NumberLiteral',
                                                  value: 4500.43,
                                                  power: 18,
                                                },
                                              ],
                                              opts: [],
                                            },
                                            {
                                              type: 'CommandExpression',
                                              name: 'flow',
                                              args: [
                                                {
                                                  type: 'ProbableIdentifier',
                                                  value: 'create',
                                                },
                                                {
                                                  type: 'VariableIdentifier',
                                                  value: '$daix',
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
                                            {
                                              type: 'CommandExpression',
                                              name: 'token',
                                              args: [
                                                {
                                                  type: 'ProbableIdentifier',
                                                  value: 'downgrade',
                                                },
                                                {
                                                  type: 'HelperFunctionExpression',
                                                  name: 'token',
                                                  args: [
                                                    {
                                                      type: 'StringLiteral',
                                                      value: 'USDCx',
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
      ];
      runCases(c, scriptParser);
    });
  });
