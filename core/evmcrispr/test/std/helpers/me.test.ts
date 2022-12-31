import {
  WALLETS,
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import type { Signer } from 'ethers';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

describe('Std > helpers > @me', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  beforeAll(() => {
    [signer] = WALLETS;
  });

  it('should return the current connected account', async () => {
    const [interpret] = await preparingExpression(`@me`, signer);

    expect(await interpret()).to.equals(await signer.getAddress());
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@me',
    [],
    { type: ComparisonType.Equal, minValue: 0 },
    lazySigner,
  );
});
