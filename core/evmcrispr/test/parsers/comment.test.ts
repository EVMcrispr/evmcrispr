import { runParser } from '@1hive/evmcrispr-test-common';
import type { Case } from '@1hive/evmcrispr-test-common';

import { scriptParser } from '../../src';

describe('Parsers - comment', () => {
  describe.concurrent.each<Case>([
    {
      title: 'normal',
      value: `
    # a comment here
    load aragonos as ar

    #another one here
    set $var1 1e18

    #one at the end
  `,
    },
    {
      title: 'inline',
      value: `
      load aragonos as ar # this is an inline comment
      set $var1 1e18 #another one
    `,
    },
  ])('', ({ title, value }) => {
    it(`should parse a ${title} comment correctly`, () => {
      const parsedValue = runParser(scriptParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });
});
