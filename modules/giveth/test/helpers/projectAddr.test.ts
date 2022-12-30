import { ComparisonType, NodeType } from '@1hive/evmcrispr';
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';

import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

describe('Giveth > helpers > @projectAddr(slug)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
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
