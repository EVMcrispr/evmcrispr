import { expect } from 'chai';

import { tokenize } from '../src/cas11/Tokenizer';
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
      // expect(typeof result === T).to.be.true;
      expect(result, `Case ${token}: invalid match`).to.deep.equals({
        type: tokenType,
        value: token,
      });
    }),
  );
};
describe.only('Tokenizer', () => {
  // const script =
  //   'install wrapped-hooked-token-manager.open:membership-tm ${token} false 0';

  describe('when testing punctuation tokens', () => {
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

  describe('when testing keyword tokens', () => {
    const cases: string[] = ['as', 'connect', 'load'];

    testCases(cases, KEYWORD);
  });

  describe.only('when testing type tokens', () => {
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
});
