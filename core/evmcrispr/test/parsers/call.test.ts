import type { Case } from '@1hive/evmcrispr-test-common';
import { runParser } from '@1hive/evmcrispr-test-common';

import { callExpressionParser } from '../../src/parsers/call';

describe('Parsers - call expression', () => {
  describe.concurrent.each<Case>([
    {
      title: 'made from a literal address',
      value: `0x14FA5C16Af56190239B997485656F5c8b4f86c4b::getEntry(0, @token(WETH))`,
    },
    {
      title: 'containing nested call expression',
      value: `$superfluid::createFlow(@token("DAIx"), $finance::vault([1,2,3]), $contract::method(), 10e18m, 'this is a nice description')`,
    },
    {
      title: 'made from a helper function',
      value: `@token(DAIx)::upgrade(@token(DAI), 1800e18)`,
    },
    {
      title: 'with following chained call expressions',
      value: `$registryContract::getToken(1)::approve(@me, 560.25e18)::another()`,
    },
  ])('', ({ title, value }) => {
    it(`should parse a call expression ${title} correctly`, () => {
      const parsedValue = runParser(callExpressionParser, value);

      expect(parsedValue).toMatchSnapshot();
    });
  });
});
