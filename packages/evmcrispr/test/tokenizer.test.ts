import { expect } from 'chai';
import { stub } from 'sinon';

import { TokenizerError, tokenize } from '../src/cas11/Tokenizer';
import type { Token } from '../src/cas11/types';
import { TokenType } from '../src/cas11/types';
import { cases } from './cases';

const {
  ADDRESS,
  BOOLEAN,
  HEXADECIMAL,
  IDENTIFIER,
  NUMBER,
  STRING,

  AS,
  LOAD,
  SET,
  SWITCH,

  RIGHT_PAREN,
  LEFT_PAREN,
  COMMA,
  DOT,
  COLON,
  AT,
  PLUS,
  MINUS,
  SLASH,
  STAR,
  POWER,
  PERCENTAGE,
} = TokenType;

type Case = [string[], TokenType];

const testCases = (cases: Case[], setLiteral = false) => {
  cases.forEach(([characters, type]) => {
    characters.map((c) =>
      it(`should tokenize \`${c}\` as ${type}`, () => {
        const [result] = tokenize(c);
        expect(result, `Case ${c}: invalid match`).to.deep.equals({
          type,
          literal: setLiteral ? c : undefined,
          position: {
            line: 0,
            column: 0,
          },
        } as Token);
      }),
    );
  });
};

describe.only('Tokenizer', () => {
  describe('when tokenizing punctuations', () => {
    const cases: Case[] = [
      [[')'], RIGHT_PAREN],
      [['('], LEFT_PAREN],
      [[','], COMMA],
      [['.'], DOT],
      [[':'], COLON],
      [['@'], AT],
      [['+'], PLUS],
      [['-'], MINUS],
      [['/'], SLASH],
      [['*'], STAR],
      [['^'], POWER],
      [['%'], PERCENTAGE],
    ];

    testCases(cases);
  });

  describe('when tokenizing keywords', () => {
    const cases: Case[] = [
      [['as'], AS],
      [['load'], LOAD],
      [['switch'], SWITCH],
      [['set'], SET],
    ];

    testCases(cases);
  });

  describe('when tokenizing literals', () => {
    const cases: Case[] = [
      [['true', 'false'], BOOLEAN],
      [['0x83E57888cd55C3ea1cfbf0114C963564d81e318d'], ADDRESS],
      [
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
        NUMBER,
      ],
      [
        [
          '0xa3432da4567be',
          '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
        ],
        HEXADECIMAL,
      ],
      [[`"this is a simple string 34 "`, `' ( ͡° ͜ʖ ͡°) '`], STRING],
      [
        [
          'new',
          'install',
          '$variable',
          'agent',
          'create-flow',
          'create-super-flow-xtreme-aa',
          '$a-new-variable',
        ],
        IDENTIFIER,
      ],
    ];

    testCases(cases, true);
  });

  describe('when tokenizing a script', () => {
    it('should failed when tokenizing an invalid one', () => {
      const consoleErrorStub = stub(console, 'error');
      const invalidScript = `
          load superfluid as sf

          token approve 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 ?@me 20.5e18

          flow create 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 ¿0x659635Fab0A0cef1293f7eb3c7934542B6A6B31A 0.001e18 "rent payment"
        `;

      expect(
        () => tokenize(invalidScript),
        'Throwed error mismatched',
      ).to.throw(TokenizerError);
      expect(consoleErrorStub.callCount).to.equal(
        2,
        '`console.error()` call count mismatched',
      );
      expect(
        consoleErrorStub.calledWith('Error (5, 66): Unexpected character "¿"'),
      ).to.be.true;
      expect(
        consoleErrorStub.calledWith('Error (3, 68): Unexpected character "?"'),
      ).to.be.true;
    });

    cases.forEach(([script, tokens]) =>
      it(`should tokenize \`${script} \``, () =>
        expect(tokenize(script)).to.deep.equal(tokens)),
    );
  });
});
