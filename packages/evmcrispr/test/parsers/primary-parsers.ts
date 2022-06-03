import { expect } from 'chai';

import {
  addressParser,
  booleanParser,
  hexadecimalParser,
  identifierParser,
  numberParser,
  stringParser,
  variableIdentifierParser,
} from '../../src/cas11/parsers/primaries';

import { runParser } from '../test-helpers/cas11';

export const primaryParsersDescribe = (): Mocha.Suite =>
  describe('Primary parsers', () => {
    describe('when parsing literal values', () => {
      it('should parse an address', () => {
        expect(
          runParser(
            addressParser,
            '0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3',
          ),
        ).to.deep.equal({
          type: 'AddressLiteral',
          value: '0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3',
        });
      });

      it('should parse a hexadecimal value', () => {
        [
          '0xa3432da4567be',
          '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
        ].forEach((value) =>
          expect(runParser(hexadecimalParser, value)).to.deep.equal({
            type: 'BytesLiteral',
            value,
          }),
        );
      });

      it('should parse a boolean value', () => {
        ['true', 'false'].forEach((value) =>
          expect(runParser(booleanParser, value)).to.deep.equal({
            type: 'BoolLiteral',
            value,
          }),
        );
      });

      it('should parse a numeric value', () => {
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
        ].forEach((value) =>
          expect(runParser(numberParser, value)).to.deep.equal({
            type: 'NumberLiteral',
            value,
          }),
        );
      });

      it('should parse string values', () => {
        [
          [`'a test single quote string'`, 'a test single quote string'],
          [`"a test double quote string"`, 'a test double quote string'],
          [`' ( ͡° ͜ʖ ͡°) '`, ' ( ͡° ͜ʖ ͡°) '],
        ].forEach(([value, expectedValue]) =>
          expect(runParser(stringParser, value)).to.deep.equal({
            type: 'StringLiteral',
            value: expectedValue,
          }),
        );
      });
    });

    describe('when parsing identifier values', () => {
      it('should parse identifier values', () => {
        [
          'new',
          'install',
          'aNewAgent',
          'create-flow',
          'create-super-flow-xtreme-aa',
        ].forEach((value) =>
          expect(runParser(identifierParser, value)).to.deep.equal({
            type: 'Identifier',
            value,
          }),
        );
      });

      it('should parse variable values', () => {
        ['$variable', '$aCamelCaseVariable', '$a-snake-case-variable'].forEach(
          (value) =>
            expect(runParser(variableIdentifierParser, value)).to.deep.equal({
              type: 'VariableIdentifier',
              value,
            }),
        );
      });
    });
  });
