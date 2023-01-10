import { runParser } from '@1hive/evmcrispr-test-common';
import type { Case } from '@1hive/evmcrispr-test-common';

import { arithmeticParser } from '../../src/parsers/arithmetic';

describe.concurrent('Parsers - arithmetic', () => {
  describe.each<Case>([
    { title: '', value: '(9 + 5 - 4 * 4 / 3 ^ 2)' },
    {
      title: 'with trailing spaces at both ends',
      value: '(   9 + 5 - 4 * (4 / 3) ^ 3    )',
    },
    {
      title: 'with in-between trailing spaces',
      value: '(9 +    5    - 4    *     4   /    3)',
    },
    {
      title: 'containing priority parenthenses',
      value: '(9^33 + (5 - 4) * (4 / 3))',
    },
    {
      title: 'containing helper functions and call expressions',
      value:
        '(90.45e18 + (5000e18 - @token.balance( DAI, @me)) * (someContract::getAmount() / 3) + $some-Variable ^ 2)',
    },
  ])('', ({ title, value }) => {
    it(`should parse an arithmetic operation ${title} correctly`, () => {
      const parsedValue = runParser(arithmeticParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });
});
