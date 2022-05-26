import type { Token } from '../../src/cas11/types';
import { TokenType } from '../../src/cas11/types';

const {
  ADDRESS,
  NUMBER,
  LOAD,
  IDENTIFIER,
  AS,
  AT,
  NEW_LINE,
  LEFT_PAREN,
  RIGHT_PAREN,
  COLON,
  DOT,
  COMMA,
  STRING,
  EOF,
  BOOLEAN,
  SET,
  PLUS,
  STAR,
  SLASH,
} = TokenType;

export const cases: [string, Token[]][] = [
  [
    `
  load aragonos as ar

exec vault transfer @token(WXDAI) agent:new 100.23e18
install wrapped-hooked-token-manager.open:membership-tm 0x6B175474E89094C44Da98b954EedeAC495271d0F false 0
0xfbddadd80fe7bda00b901fbaf73803f2238ae655:load(0x228463ceea874eb10f73b0654462b68c368198e5, 10e18, 'create new tokens')
    `,
    [
      {
        type: LOAD,
        literal: undefined,
        position: { line: 0, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'aragonos',
        position: { line: 0, column: 5 },
      },
      {
        type: AS,
        literal: undefined,
        position: { line: 0, column: 14 },
      },
      {
        type: IDENTIFIER,
        literal: 'ar',
        position: { line: 0, column: 17 },
      },
      {
        type: NEW_LINE,
        literal: undefined,
        position: { line: 0, column: 19 },
      },
      {
        type: NEW_LINE,
        literal: undefined,
        position: { line: 1, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'exec',
        position: { line: 2, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'vault',
        position: { line: 2, column: 5 },
      },
      {
        type: IDENTIFIER,
        literal: 'transfer',
        position: { line: 2, column: 11 },
      },
      {
        type: AT,
        literal: undefined,
        position: { line: 2, column: 20 },
      },
      {
        type: IDENTIFIER,
        literal: 'token',
        position: { line: 2, column: 21 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 2, column: 26 },
      },
      {
        type: IDENTIFIER,
        literal: 'WXDAI',
        position: { line: 2, column: 27 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 2, column: 32 },
      },
      {
        type: IDENTIFIER,
        literal: 'agent',
        position: { line: 2, column: 34 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 2, column: 39 },
      },
      {
        type: IDENTIFIER,
        literal: 'new',
        position: { line: 2, column: 40 },
      },
      {
        type: NUMBER,
        literal: '100.23e18',
        position: { line: 2, column: 44 },
      },
      {
        type: NEW_LINE,
        literal: undefined,
        position: { line: 2, column: 53 },
      },
      {
        type: IDENTIFIER,
        literal: 'install',
        position: { line: 3, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'wrapped-hooked-token-manager',
        position: { line: 3, column: 8 },
      },
      {
        type: DOT,
        literal: undefined,
        position: { line: 3, column: 36 },
      },
      {
        type: IDENTIFIER,
        literal: 'open',
        position: { line: 3, column: 37 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 3, column: 41 },
      },
      {
        type: IDENTIFIER,
        literal: 'membership-tm',
        position: { line: 3, column: 42 },
      },
      {
        type: ADDRESS,
        literal: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        position: { line: 3, column: 56 },
      },
      {
        type: BOOLEAN,
        literal: 'false',
        position: { line: 3, column: 99 },
      },
      {
        type: NUMBER,
        literal: '0',
        position: { line: 3, column: 105 },
      },
      {
        type: NEW_LINE,
        literal: undefined,
        position: { line: 3, column: 106 },
      },
      {
        type: ADDRESS,
        literal: '0xfbddadd80fe7bda00b901fbaf73803f2238ae655',
        position: { line: 4, column: 0 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 4, column: 42 },
      },
      {
        type: LOAD,
        literal: undefined,
        position: { line: 4, column: 43 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 4, column: 47 },
      },
      {
        type: ADDRESS,
        literal: '0x228463ceea874eb10f73b0654462b68c368198e5',
        position: { line: 4, column: 48 },
      },
      {
        type: COMMA,
        literal: undefined,
        position: { line: 4, column: 90 },
      },
      {
        type: NUMBER,
        literal: '10e18',
        position: { line: 4, column: 92 },
      },
      {
        type: COMMA,
        literal: undefined,
        position: { line: 4, column: 97 },
      },
      {
        type: STRING,
        literal: "'create new tokens'",
        position: { line: 4, column: 99 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 4, column: 118 },
      },
      { type: EOF },
    ],
  ],
  [
    `set $new-agent agent.open.3`,
    [
      {
        type: SET,
        literal: undefined,
        position: { line: 0, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: '$new-agent',
        position: { line: 0, column: 4 },
      },
      {
        type: IDENTIFIER,
        literal: 'agent',
        position: { line: 0, column: 15 },
      },
      {
        type: DOT,
        literal: undefined,
        position: { line: 0, column: 20 },
      },
      {
        type: IDENTIFIER,
        literal: 'open',
        position: { line: 0, column: 21 },
      },
      {
        type: DOT,
        literal: undefined,
        position: { line: 0, column: 25 },
      },
      {
        type: NUMBER,
        literal: '3',
        position: { line: 0, column: 26 },
      },
      { type: EOF },
    ],
  ],
  [
    `$registry:getEntry(0, "this example"):cid`,
    [
      {
        type: IDENTIFIER,
        literal: '$registry',
        position: { line: 0, column: 0 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 0, column: 9 },
      },
      {
        type: IDENTIFIER,
        literal: 'getEntry',
        position: { line: 0, column: 10 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 0, column: 18 },
      },
      {
        type: NUMBER,
        literal: '0',
        position: { line: 0, column: 19 },
      },
      {
        type: COMMA,
        literal: undefined,
        position: { line: 0, column: 20 },
      },
      {
        type: STRING,
        literal: '"this example"',
        position: { line: 0, column: 22 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 0, column: 36 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 0, column: 37 },
      },
      {
        type: IDENTIFIER,
        literal: 'cid',
        position: { line: 0, column: 38 },
      },
      { type: EOF },
    ],
  ],
  [
    `@token(DAI):balanceOf(@me)`,
    [
      {
        type: AT,
        literal: undefined,
        position: { line: 0, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'token',
        position: { line: 0, column: 1 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 0, column: 6 },
      },
      {
        type: IDENTIFIER,
        literal: 'DAI',
        position: { line: 0, column: 7 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 0, column: 10 },
      },
      {
        type: COLON,
        literal: undefined,
        position: { line: 0, column: 11 },
      },
      {
        type: IDENTIFIER,
        literal: 'balanceOf',
        position: { line: 0, column: 12 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 0, column: 21 },
      },
      {
        type: AT,
        literal: undefined,
        position: { line: 0, column: 22 },
      },
      {
        type: IDENTIFIER,
        literal: 'me',
        position: { line: 0, column: 23 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 0, column: 25 },
      },
      { type: EOF },
    ],
  ],
  [
    '@calc(445 + (523.32 * 2.5) / 0.1)',
    [
      {
        type: AT,
        literal: undefined,
        position: { line: 0, column: 0 },
      },
      {
        type: IDENTIFIER,
        literal: 'calc',
        position: { line: 0, column: 1 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 0, column: 5 },
      },
      {
        type: NUMBER,
        literal: '445',
        position: { line: 0, column: 6 },
      },
      {
        type: PLUS,
        literal: undefined,
        position: { line: 0, column: 10 },
      },
      {
        type: LEFT_PAREN,
        literal: undefined,
        position: { line: 0, column: 12 },
      },
      {
        type: NUMBER,
        literal: '523.32',
        position: { line: 0, column: 13 },
      },
      {
        type: STAR,
        literal: undefined,
        position: { line: 0, column: 20 },
      },
      {
        type: NUMBER,
        literal: '2.5',
        position: { line: 0, column: 22 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 0, column: 25 },
      },
      {
        type: SLASH,
        literal: undefined,
        position: { line: 0, column: 27 },
      },
      {
        type: NUMBER,
        literal: '0.1',
        position: { line: 0, column: 29 },
      },
      {
        type: RIGHT_PAREN,
        literal: undefined,
        position: { line: 0, column: 32 },
      },
      { type: EOF },
    ],
  ],
];
