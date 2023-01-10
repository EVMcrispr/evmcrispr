import type { Case } from '@1hive/evmcrispr-test-common';
import { runParser, runParserError } from '@1hive/evmcrispr-test-common';

import { arrayExpressionParser } from '../../src/parsers/array';

describe.concurrent('Parsers - array', () => {
  describe.concurrent.each<Case>([
    { title: '', value: '[12, "a string"]' },
    {
      title: 'with spaces at both ends',
      value: '[    1, "a text string",    3    ]',
    },
    {
      title: 'with nested arrays',
      value:
        '[145e18y, @token(DAI), false, ["a string", anIdentifier, [1, 2, [aDeepDeepIdentifier.open]],  $variable], $fDAIx::host()]',
    },
  ])('', ({ title, value }) => {
    it(`should parse an array ${title} correctly`, () => {
      const parsedValue = runParser(arrayExpressionParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });

  describe.concurrent.each<Case>([
    {
      title: 'with multiple primary values between commas',
      value: '[1,multiple values between commas, false]',
    },
    { title: 'with empty elements', value: '[12e14w, ,,]' },
    { title: 'without closing brackets', value: '[12e14w, "asdas"' },
  ])('', ({ title, value }) => {
    it(`should fail when parsing an array ${title}`, () => {
      const error = runParserError(arrayExpressionParser, value);

      expect(error).toMatchSnapshot();
    });
  });
});
