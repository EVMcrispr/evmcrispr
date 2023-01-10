import type { Case } from '@1hive/evmcrispr-test-common';
import { runParser, runParserError } from '@1hive/evmcrispr-test-common';

import {
  addressParser,
  booleanParser,
  hexadecimalParser,
  numberParser,
  probableIdentifierParser,
  stringParser,
  variableIdentifierParser,
} from '../../src/parsers/primaries';

describe.concurrent('Parsers - primaries', () => {
  describe('when parsing literal values', () => {
    describe('when parsing address values', () => {
      it('should parse them correctly', () => {
        expect(
          runParser(
            addressParser(),
            '0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3',
          ),
        ).to.toMatchSnapshot();
      });

      it('should fail when parsing an invalid one', () => {
        const error = runParserError(
          addressParser(),
          '0xasdabmtbrtbrtgsdfsvbrty',
        );

        expect(error).toMatchSnapshot();
      });
    });

    describe('when parsing hexadecimal values', () => {
      describe.each<Case>([
        {
          title: 'value',
          value: '0xa3432da4567be',
        },
        {
          title: 'long value',
          value:
            '0x0e80f0b30000000000000000000000008e6cd950ad6ba651f6dd608dc70e5886b1aa6b240000000000000000000000002f00df4f995451e0df337b91744006eb8892bfb10000000000000000000000000000000000000000000000004563918244f40000',
        },
      ])('', ({ title, value }) => {
        it(`should parse a ${title} correctly`, () => {
          const parsedValue = runParser(hexadecimalParser(), value);
          expect(parsedValue).to.matchSnapshot();
        });
      });

      it('should fail when parsing an invalid value', () => {
        const error = runParserError(
          hexadecimalParser(),
          '0xasdadqlkerrtrtnrn',
        );

        expect(error).toMatchSnapshot();
      });
    });

    describe('when parsing boolean values', () => {
      describe.each<Case>([
        { title: '"true" value', value: 'true' },
        { title: '"value" value', value: 'false' },
      ])('', ({ title, value }) => {
        it(`should parse ${title} correctly`, () => {
          const parsedValue = runParser(booleanParser(), value);

          expect(parsedValue).toMatchSnapshot();
        });
      });

      it('should fail when parsing an invalid value', () => {
        const error = runParserError(booleanParser(), 'fals');

        expect(error).toMatchSnapshot();
      });
    });

    describe('when parsing numeric values', () => {
      describe.each<Case>([
        { title: 'integer value', value: '15' },
        { title: 'exponent value', value: '9200e18' },
        { title: 'value with a decimal', value: '4500.32' },
        { title: 'value with a decimal and exponent', value: '0.5e14' },
        {
          title: 'value with a decimal, exponent and temporal unit',
          value: '20.3245e18mo',
        },
        { title: 'value with a secondly temporal unit', value: '50s' },
        { title: 'value with a minutely temporal unit', value: '5m' },
        { title: 'value with an hourly temporal unit', value: '35h' },
        { title: 'value with an daily temporal unit', value: '365d' },
        { title: 'value with an weekly temporal unit', value: '72w' },
        { title: 'value with an monthly temporal unit', value: '6.5mo' },
        { title: 'value with an yearly temporal unit', value: '2.5y' },
      ])('', ({ title, value }) => {
        it(`should parse a ${title} correctly`, () => {
          const parsedValue = runParser(numberParser(), value);

          expect(parsedValue).toMatchSnapshot();
        });
      });

      describe.each<Case>([
        { title: 'incomplete decimal', value: '123.e18' },
        { title: 'incomplete exponent', value: '123.2ew' },
        { title: 'invalid time unit', value: '123.45e13w34' },
      ])('', ({ title, value }) => {
        it(`should fail when parsing an ${title}`, () => {
          const error = runParserError(numberParser(), value);

          expect(error).toMatchSnapshot();
        });
      });
    });

    describe('when parsing string values', () => {
      describe.each<Case>([
        {
          title: 'a single quote value',
          value: `'a test single quote string'`,
        },
        {
          title: 'a double quote value',
          value: `"a test double quote string"`,
        },
        {
          title: 'a value with special characters',
          value: `'alpha (with beta) ? --'`,
        },
      ])('', ({ title, value }) => {
        it(`should parse a ${title} correctly`, () => {
          const parsedValue = runParser(stringParser(), value);

          expect(parsedValue).toMatchSnapshot;
        });
      });
    });

    it('should fail when parsing an invalid string', () => {
      const error = runParserError(stringParser(), '"asdadasdasd');

      expect(error).toMatchSnapshot();
    });
  });

  describe('when parsing probable identifiers', () => {
    describe.each<Case>([
      { title: '', value: 'new' },
      { title: 'camel case', value: 'aNewAgent' },
      { title: 'kebab case ', value: 'create-flow' },
      { title: 'long kebab case', value: 'create-super-flow-xtreme-aa' },
      { title: 'kebab case with dot', value: 'my-ens-name.eth' },
      { title: 'dots and numbers', value: 'agent.open.0' },
      { title: 'kebab case with colon', value: 'superfluid-app.other-open:20' },
      { title: 'date-like', value: '2015-20-09' },
      { title: 'signature-like', value: 'aSIgnature(with,some,params)' },
      { title: 'no-params-signature-like', value: 'noParamSignature()' },
    ])('', ({ title, value }) => {
      it(`should parse a ${title} value correctly`, () => {
        const parsedValue = runParser(probableIdentifierParser(), value);

        expect(parsedValue).toMatchSnapshot();
      });
    });

    it('fail when parsing an invalid identifier', () => {
      const error = runParserError(probableIdentifierParser(), 'asd([[))');

      expect(error).toMatchSnapshot();
    });
  });

  describe('when parsing variable identifiers', () => {
    describe.each<Case>([
      { title: '', value: '$variable' },
      { title: 'camel case', value: '$aCamelCaseVariable' },
      { title: 'snake case', value: '$a-snake-case-variable' },
      {
        title: 'snake case with colon and number',
        value: '$token-manager.open:0',
      },
    ])('when parsing variable values', ({ title, value }) => {
      it(`should parse a ${title} value correctly`, () => {
        const parsedValue = runParser(variableIdentifierParser(), value);

        expect(parsedValue).toMatchSnapshot();
      });
    });

    it('should fail when parsing invalid variables', () => {
      const error = runParserError(variableIdentifierParser(), '$asd/()');

      expect(error).toMatchSnapshot();
    });
  });
});
