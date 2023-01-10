import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import type { Signer } from 'ethers';
import { utils } from 'ethers';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

describe('Std > helpers > @id(value)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  beforeAll(async (ctx) => {
    [signer] = await ctx.file!.utils.getWallets();
  });

  it('return the hashed value', async () => {
    const [interpret] = await preparingExpression(
      `@id('an example test')`,
      signer,
    );

    expect(await interpret()).to.equals(utils.id('an example test'));
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@id',
    ['exampleValue'],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazySigner,
  );
});
