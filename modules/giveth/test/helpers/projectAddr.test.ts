import { ComparisonType, NodeType } from '@1hive/evmcrispr';
import {
  WALLETS,
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';

import type { Signer } from 'ethers';

describe('Giveth > helpers > @projectAddr(slug)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  beforeAll(() => {
    [signer] = WALLETS;
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
