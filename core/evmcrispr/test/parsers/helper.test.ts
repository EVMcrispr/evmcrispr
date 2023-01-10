import type { Case } from '@1hive/evmcrispr-test-common';
import { runParser, runParserError } from '@1hive/evmcrispr-test-common';

import { helperFunctionParser } from '../../src/parsers/helper';

describe.concurrent('Parsers - helper functions', () => {
  describe.each<Case>([
    {
      title: '',
      value: '@token(WETH)',
    },
    {
      title: 'with call expression',
      value:
        '@helperFunction(anotherToken::symbol(), "this is a string param", 10e18)',
    },
    {
      title: 'with no arguments',
      value: '@now',
    },
    {
      title: 'with nested helpers',
      value: `@token('DAI', @calc(34, @innerHelper(true)))`,
    },
  ])('', ({ title, value }) => {
    it(`should parse helper ${title} correctly`, () => {
      const parsedValue = runParser(helperFunctionParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });

  describe.each<Case>([
    { title: 'an invalid name', value: '@asd&$6' },
    { title: 'no closing parenthesis', value: '@helper(asda,1e18' },
    { title: 'no opening parenthesis', value: '@helperarg1, 1e18, ,)' },
    { title: 'empty arguments', value: '@helper(arg1, 1e18, ,)' },
  ])('', ({ title, value }) => {
    it(`should fail when parsing a helper with ${title}`, () => {
      const error = runParserError(helperFunctionParser, value);

      expect(error).toMatchSnapshot();
    });
  });
});
