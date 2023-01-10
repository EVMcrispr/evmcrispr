import { ComparisonType, NodeType } from '@1hive/evmcrispr';
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';

import type { Signer } from 'ethers';

describe('Giveth > helpers > @projectAddr(slug)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  beforeAll(async (ctx) => {
    [signer] = await ctx.file!.utils.getWallets();
  });

  it('return the hashed value', async () => {
    const [interpret] = await preparingExpression(
      `@projectAddr(evmcrispr)`,
      signer,
      'giveth',
    );

    expect(await interpret()).to.equals(
      '0xeafFF6dB1965886348657E79195EB6f1A84657eB',
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@projectAddr',
    ['evmcrispr'],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazySigner,
    'giveth',
  );
});
