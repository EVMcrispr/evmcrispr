import { expect } from 'chai';

import {
  ADDRESS_PARSER_ERROR,
  BOOLEAN_PARSER_ERROR,
  PROBABLE_IDENTIFIER_PARSER_ERROR,
  STRING_PARSER_ERROR,
  VARIABLE_PARSER_ERROR,
  addressParser,
  booleanParser,
  hexadecimalParser,
  numberParser,
  probableIdentifierParser,
  stringParser,
  variableIdentifierParser,
} from '../../src/cas11/parsers/primaries';
import { HEXADECIMAL_PARSER_ERROR } from '../../src/cas11/parsers/primaries/literals/hexadecimal';
import type {
  NumericLiteralNode,
  ProbableIdentifierNode,
  StringLiteralNode,
} from '../../src/cas11/types';
import { NodeType } from '../../src/cas11/types';

import type { Case } from '../test-helpers/cas11';
import { runCases, runErrorCase, runParser } from '../test-helpers/cas11';

export const primaryParsersDescribe = (): Mocha.Suite =>
  describe('Primary parsers', () => {
    describe('when parsing literal values', () => {
      describe('when parsing address values', () => {
        it('should parse them correctly', () => {
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

        it('should fail when parsing an invalid one', () => {
          runErrorCase(
            addressParser,
            '0xasdabmtbrtbrtgsdfsvbrty',
            ADDRESS_PARSER_ERROR,
            'Expecting an address',
          );
        });
      });

      describe('when parsing hexadecimal values', () => {
        it('should parse them correctly', () => {
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

        it('should fail when parsing an invalid one', () => {
          runErrorCase(
            hexadecimalParser,
            '0xasdadqlkerrtrtnrn',
            HEXADECIMAL_PARSER_ERROR,
            'Expecting a hexadecimal value',
          );
        });
      });

      describe('when parsing boolean values', () => {
        it('should parse them correctly', () => {
          ['true', 'false'].forEach((value) =>
            expect(runParser(booleanParser, value)).to.deep.equal({
              type: 'BoolLiteral',
              value: value === 'true',
            }),
          );
        });

        it('should fail when parsing an invalid one', () => {
          runErrorCase(
            booleanParser,
            'fals',
            BOOLEAN_PARSER_ERROR,
            'Expecting "true" or "false"',
          );
        });
      });

      describe('when parsing numeric values', () => {
        const errorType = 'NumberParserError';

        it('should parse them correctly', () => {
          const node = (
            value: number,
            power?: number,
            timeUnit?: string,
          ): NumericLiteralNode => {
            const n: NumericLiteralNode = {
              type: NodeType.NumberLiteral,
              value,
            };
            if (power) n.power = power;
            if (timeUnit) n.timeUnit = timeUnit;

            return n;
          };
          const cases: Case[] = [
            ['15', node(15)],
            ['9200e18', node(9200, 18)],
            ['4500.32', node(4500.32)],
            ['0.5e14', node(0.5, 14)],
            ['20.3245e18mo', node(20.3245, 18, 'mo')],
            ['50s', node(50, undefined, 's')],
            ['5m', node(5, undefined, 'm')],
            ['35h', node(35, undefined, 'h')],
            ['365d', node(365, undefined, 'd')],
            ['72w', node(72, undefined, 'w')],
            ['6.5mo', node(6.5, undefined, 'mo')],
            ['2.5y', node(2.5, undefined, 'y')],
          ];

          runCases(cases, numberParser);
        });

        it('should fail when parsing an incomplete decimal', () => {
          runErrorCase(
            numberParser,
            '123.e18',
            errorType,
            'Invalid decimal. Expecting digits',
          );
        });

        it('should fail when parsing an incomplete exponent', () => {
          () => {
            runErrorCase(
              numberParser,
              '123.2ew',
              errorType,
              'Invalid exponent. Expecting digits',
            );
          };
        });

        it('should fail when parsing an invalid time unit', () => {
          runErrorCase(
            numberParser,
            '123.45e13w34',
            errorType,
            'Invalid time unit. Expecting letters only',
          );
        });
      });

      describe('when parsing string values', () => {
        it('should parse quoted ones', () => {
          const node = (value: string): StringLiteralNode => {
            const n: StringLiteralNode = {
              type: NodeType.StringLiteral,
              value,
            };
            return n;
          };

          const cases: Case[] = [
            [
              `'a test single quote string'`,
              node('a test single quote string'),
            ],
            [
              `"a test double quote string"`,
              node('a test double quote string'),
            ],
            [`' ( ͡° ͜ʖ ͡°) '`, node(' ( ͡° ͜ʖ ͡°) ')],
          ];

          runCases(cases, stringParser);
        });
      });

      it('should fail when parsing an invalid one', () => {
        runErrorCase(
          stringParser,
          '"asdadasdasd',
          STRING_PARSER_ERROR,
          'Expecting a quoted string',
        );
      });
    });

    describe('when parsing identifiers', () => {
      it('should parse probable identifier values', () => {
        const node = (value: string): ProbableIdentifierNode => {
          const n: ProbableIdentifierNode = {
            type: NodeType.ProbableIdentifier,
            value,
          };

          return n;
        };

        [
          'new',
          'install',
          'aNewAgent',
          'create-flow',
          'create-super-flow-xtreme-aa',
          'my-ens-name.eth',
          'agent.open.0',
          'superfluid-app.other-open:20',
          '2015-20-09',
        ].forEach((value) =>
          expect(runParser(probableIdentifierParser, value)).to.eql(
            node(value),
          ),
        );
      });

      it('fail when parsing an invalid identifier', () => {
        runErrorCase(
          probableIdentifierParser,
          'asd([[))',
          PROBABLE_IDENTIFIER_PARSER_ERROR,
          'Expecting an identifier',
        );
      });

      it('should parse variable values', () => {
        [
          '$variable',
          '$aCamelCaseVariable',
          '$a-snake-case-variable',
          '$token-manager.open:0',
        ].forEach((value) =>
          expect(runParser(variableIdentifierParser, value)).to.deep.equal({
            type: 'VariableIdentifier',
            value,
          }),
        );
      });

      it('should fail when parsing invalid variables', () => {
        runErrorCase(
          variableIdentifierParser,
          '$asd/()',
          VARIABLE_PARSER_ERROR,
          'Expecting a variable',
        );
      });
    });
  });
