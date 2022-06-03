import { scriptParser } from '../../src/cas11/parsers/script';
import type { Case } from '../test-helpers/cas11';
import { runCases } from '../test-helpers/cas11';

export const scriptParserDescribe = (): Mocha.Suite =>
  describe('Script parser', () => {
    it('should parse an script correctly', () => {
      const script = `
      load aragonos as ar
      load superfluid as sf
  
      
      connect my-dao-ens (   
        forward token-manager voting (
          install wrapper-hooked-token-manager.open 0x83E57888cd55C3ea1cfbf0114C963564d81e318d false 0
        )
        forward token-manager voting agent (
          set $agent finance:vault()
          forward wrappable-token-manager.open disputable-voting.open agent (
            set $daix @token("fDAIx")
            token approve @token('DAI') @me 15.45e18
            sf batchcall (
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
              name: { type: 'Identifier', value: 'load' },
              args: [
                {
                  type: 'AsExpression',
                  left: { type: 'Identifier', value: 'aragonos' },
                  right: { type: 'Identifier', value: 'ar' },
                },
              ],
            },
            {
              type: 'CommandExpression',
              name: { type: 'Identifier', value: 'load' },
              args: [
                {
                  type: 'AsExpression',
                  left: { type: 'Identifier', value: 'superfluid' },
                  right: { type: 'Identifier', value: 'sf' },
                },
              ],
            },
            {
              type: 'CommandExpression',
              name: { type: 'Identifier', value: 'connect' },
              args: [
                { type: 'Identifier', value: 'my-dao-ens' },
                {
                  type: 'BlockExpression',
                  body: [
                    {
                      type: 'CommandExpression',
                      name: { type: 'Identifier', value: 'forward' },
                      args: [
                        { type: 'Identifier', value: 'token-manager' },
                        { type: 'Identifier', value: 'voting' },
                        {
                          type: 'BlockExpression',
                          body: [
                            {
                              type: 'CommandExpression',
                              name: { type: 'Identifier', value: 'install' },
                              args: [
                                {
                                  type: 'Identifier',
                                  value: 'wrapper-hooked-token-manager.open',
                                },
                                {
                                  type: 'AddressLiteral',
                                  value:
                                    '0x83E57888cd55C3ea1cfbf0114C963564d81e318d',
                                },
                                { type: 'BoolLiteral', value: 'false' },
                                { type: 'NumberLiteral', value: '0' },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: 'CommandExpression',
                      name: { type: 'Identifier', value: 'forward' },
                      args: [
                        { type: 'Identifier', value: 'token-manager' },
                        { type: 'Identifier', value: 'voting' },
                        { type: 'Identifier', value: 'agent' },
                        {
                          type: 'BlockExpression',
                          body: [
                            {
                              type: 'CommandExpression',
                              name: { type: 'Identifier', value: 'set' },
                              args: [
                                { type: 'VariableIdentifier', value: '$agent' },
                                {
                                  type: 'CallExpression',
                                  target: {
                                    type: 'Identifier',
                                    value: 'finance',
                                  },
                                  callee: {
                                    type: 'Identifier',
                                    value: 'vault',
                                  },
                                  args: [],
                                },
                              ],
                            },
                            {
                              type: 'CommandExpression',
                              name: { type: 'Identifier', value: 'forward' },
                              args: [
                                {
                                  type: 'Identifier',
                                  value: 'wrappable-token-manager.open',
                                },
                                {
                                  type: 'Identifier',
                                  value: 'disputable-voting.open',
                                },
                                { type: 'Identifier', value: 'agent' },
                                {
                                  type: 'BlockExpression',
                                  body: [
                                    {
                                      type: 'CommandExpression',
                                      name: {
                                        type: 'Identifier',
                                        value: 'set',
                                      },
                                      args: [
                                        {
                                          type: 'VariableIdentifier',
                                          value: '$daix',
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: {
                                            type: 'Identifier',
                                            value: 'token',
                                          },
                                          args: [
                                            {
                                              type: 'StringLiteral',
                                              value: 'fDAIx',
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                    {
                                      type: 'CommandExpression',
                                      name: {
                                        type: 'Identifier',
                                        value: 'token',
                                      },
                                      args: [
                                        {
                                          type: 'Identifier',
                                          value: 'approve',
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: {
                                            type: 'Identifier',
                                            value: 'token',
                                          },
                                          args: [
                                            {
                                              type: 'StringLiteral',
                                              value: 'DAI',
                                            },
                                          ],
                                        },
                                        {
                                          type: 'HelperFunctionExpression',
                                          name: {
                                            type: 'Identifier',
                                            value: 'me',
                                          },
                                          args: [],
                                        },
                                        {
                                          type: 'NumberLiteral',
                                          value: '15.45e18',
                                        },
                                      ],
                                    },
                                    {
                                      type: 'CommandExpression',
                                      name: { type: 'Identifier', value: 'sf' },
                                      args: [
                                        {
                                          type: 'Identifier',
                                          value: 'batchcall',
                                        },
                                        {
                                          type: 'BlockExpression',
                                          body: [
                                            {
                                              type: 'CommandExpression',
                                              name: {
                                                type: 'Identifier',
                                                value: 'token',
                                              },
                                              args: [
                                                {
                                                  type: 'Identifier',
                                                  value: 'upgrade',
                                                },
                                                {
                                                  type: 'VariableIdentifier',
                                                  value: '$daix',
                                                },
                                                {
                                                  type: 'NumberLiteral',
                                                  value: '4500.43e18',
                                                },
                                              ],
                                            },
                                            {
                                              type: 'CommandExpression',
                                              name: {
                                                type: 'Identifier',
                                                value: 'flow',
                                              },
                                              args: [
                                                {
                                                  type: 'Identifier',
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
                                                  value: '1e18mo',
                                                },
                                              ],
                                            },
                                            {
                                              type: 'CommandExpression',
                                              name: {
                                                type: 'Identifier',
                                                value: 'token',
                                              },
                                              args: [
                                                {
                                                  type: 'Identifier',
                                                  value: 'downgrade',
                                                },
                                                {
                                                  type: 'HelperFunctionExpression',
                                                  name: {
                                                    type: 'Identifier',
                                                    value: 'token',
                                                  },
                                                  args: [
                                                    {
                                                      type: 'StringLiteral',
                                                      value: 'USDCx',
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
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];
      runCases(c, scriptParser);
    });
  });
