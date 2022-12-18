import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../../src/types';
import { ComparisonType } from '../../../../src/utils';
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '../../../test-helpers/cas11';

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
