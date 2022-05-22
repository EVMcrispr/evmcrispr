import { expect } from 'chai';

import { TokenizerError, tokenize } from '../src/cas11/Tokenizer';
import type { PunctuationToken, Token } from '../src/cas11/types';
import { TokenType } from '../src/cas11/types';

const {
  ADDRESS,
  BOOLEAN,
  HEXADECIMAL,
  IDENTIFIER,
  KEYWORD,
  NUMBER,
  PUNTUATION,
  STRING,
} = TokenType;

const testCases = <T extends Token>(cases: string[], tokenType: T['type']) => {
  cases.forEach((token) =>
    it(`should tokenize "${token}" as ${tokenType}`, () => {
      const [result] = tokenize(token);
      expect(result, `Case ${token}: invalid match`).to.deep.equals({
        type: tokenType,
        value: token,
      });
    }),
  );
};

describe.only('Tokenizer', () => {
  describe('when tokenizing punctuations', () => {
    const cases: string[] = [
      ')',
      '(',
      ',',
      '.',
      ':',
      '@',
      '+',
      '-',
      '/',
      '*',
      '^',
      '%',
    ];

    testCases<PunctuationToken>(cases, PUNTUATION);
  });

  describe('when tokenizing keywords', () => {
    const cases: string[] = ['as', 'connect', 'load', 'switch', 'set'];

    testCases(cases, KEYWORD);
  });

  describe('when tokenizing type words', () => {
    const cases: string[][] = [
      ['true', 'false'],
      ['0x83E57888cd55C3ea1cfbf0114C963564d81e318d'],
      [
        '15',
        '4500.32',
        '5e18',
        '15.6e14mo',
        '60s',
        '4.2m',
        '365d',
        '72w',
        '6.5mo',
        '2y',
      ],
      [
        '0xa3432da4567be',
        '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
      ],
      [`"this is a simple string 34 "`, `' ( ͡° ͜ʖ ͡°) '`],
      [
        'new',
        'install',
        '$variable',
        'agent',
        'create-flow',
        'create-super-flow-xtreme-aa',
        '$a-new-variable',
      ],
    ];

    testCases(cases[0], BOOLEAN);

    testCases(cases[1], ADDRESS);

    testCases(cases[2], NUMBER);

    testCases(cases[3], HEXADECIMAL);

    testCases(cases[4], STRING);

    testCases(cases[5], IDENTIFIER);
  });

  describe('when tokenizing a script', () => {
    it('should do it correctly', () => {
      expect(
        tokenize(`
      load aragonos as ar

      exec vault transfer @token(WXDAI) agent:new 100.23e18
      install wrapped-hooked-token-manager.open:membership-tm 0x6B175474E89094C44Da98b954EedeAC495271d0F false 0
      0xfbddadd80fe7bda00b901fbaf73803f2238ae655:load(0x228463ceea874eb10f73b0654462b68c368198e5, 10e18, 'create new tokens')
    `),
      ).to.deep.equal([
        { type: KEYWORD, value: 'load' },
        { type: IDENTIFIER, value: 'aragonos' },
        { type: KEYWORD, value: 'as' },
        { type: IDENTIFIER, value: 'ar' },
        { type: IDENTIFIER, value: 'exec' },
        { type: IDENTIFIER, value: 'vault' },
        { type: IDENTIFIER, value: 'transfer' },
        { type: PUNTUATION, value: '@' },
        { type: IDENTIFIER, value: 'token' },
        { type: PUNTUATION, value: '(' },
        { type: IDENTIFIER, value: 'WXDAI' },
        { type: PUNTUATION, value: ')' },
        { type: IDENTIFIER, value: 'agent' },
        { type: PUNTUATION, value: ':' },
        { type: IDENTIFIER, value: 'new' },
        { type: NUMBER, value: '100.23e18' },
        { type: IDENTIFIER, value: 'install' },
        { type: IDENTIFIER, value: 'wrapped-hooked-token-manager' },
        { type: PUNTUATION, value: '.' },
        { type: IDENTIFIER, value: 'open' },
        { type: PUNTUATION, value: ':' },
        { type: IDENTIFIER, value: 'membership-tm' },
        { type: ADDRESS, value: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
        { type: BOOLEAN, value: 'false' },
        { type: NUMBER, value: '0' },
        {
          type: 'ADDRESS',
          value: '0xfbddadd80fe7bda00b901fbaf73803f2238ae655',
        },
        { type: 'PUNTUATION', value: ':' },
        { type: 'IDENTIFIER', value: 'load' },
        { type: 'PUNTUATION', value: '(' },
        {
          type: 'ADDRESS',
          value: '0x228463ceea874eb10f73b0654462b68c368198e5',
        },
        { type: 'PUNTUATION', value: ',' },
        { type: 'NUMBER', value: '10e18' },
        { type: 'PUNTUATION', value: ',' },
        { type: 'STRING', value: "'create new tokens'" },
        { type: 'PUNTUATION', value: ')' },
      ]);

      expect(tokenize(`set $new-agent agent.open.3`)).to.deep.equal([
        { type: KEYWORD, value: 'set' },
        { type: IDENTIFIER, value: '$new-agent' },
        { type: IDENTIFIER, value: 'agent' },
        { type: PUNTUATION, value: '.' },
        { type: IDENTIFIER, value: 'open' },
        { type: PUNTUATION, value: '.' },
        { type: NUMBER, value: '3' },
      ]);

      expect(
        tokenize(`$registry:getEntry(0, "this example"):cid`),
      ).to.deep.equal([
        { type: IDENTIFIER, value: '$registry' },
        { type: PUNTUATION, value: ':' },
        { type: IDENTIFIER, value: 'getEntry' },
        { type: PUNTUATION, value: '(' },
        { type: NUMBER, value: '0' },
        { type: PUNTUATION, value: ',' },
        { type: STRING, value: '"this example"' },
        { type: PUNTUATION, value: ')' },
        { type: PUNTUATION, value: ':' },
        { type: IDENTIFIER, value: 'cid' },
      ]);

      expect(tokenize(`@token(DAI):balanceOf(@me)`)).to.deep.equal([
        { type: PUNTUATION, value: '@' },
        { type: IDENTIFIER, value: 'token' },
        { type: PUNTUATION, value: '(' },
        { type: IDENTIFIER, value: 'DAI' },
        { type: PUNTUATION, value: ')' },
        { type: PUNTUATION, value: ':' },
        { type: IDENTIFIER, value: 'balanceOf' },
        { type: PUNTUATION, value: '(' },
        { type: PUNTUATION, value: '@' },
        { type: IDENTIFIER, value: 'me' },
        { type: PUNTUATION, value: ')' },
      ]);

      expect(tokenize('@calc(445 + (523.32 * 2.5) / 0.1)')).to.deep.equal([
        { type: PUNTUATION, value: '@' },
        { type: IDENTIFIER, value: 'calc' },
        { type: PUNTUATION, value: '(' },
        { type: NUMBER, value: '445' },
        { type: PUNTUATION, value: '+' },
        { type: PUNTUATION, value: '(' },
        { type: NUMBER, value: '523.32' },
        { type: PUNTUATION, value: '*' },
        { type: NUMBER, value: '2.5' },
        { type: PUNTUATION, value: ')' },
        { type: PUNTUATION, value: '/' },
        { type: NUMBER, value: '0.1' },
        { type: PUNTUATION, value: ')' },
      ]);
    });

    it('should throw an error when tokenizing an invalid one', () => {
      const invalidScript = `
        load superfluid as sf

        token approve 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 ?@me 20.5e18

        flow create 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 ¿0x659635Fab0A0cef1293f7eb3c7934542B6A6B31A 0.001e18 "rent payment"
      `;

      expect(() => tokenize(invalidScript)).to.throw(TokenizerError);
    });
  });
});
