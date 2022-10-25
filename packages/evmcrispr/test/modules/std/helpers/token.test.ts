import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../../src/types';
import { ComparisonType } from '../../../../src/utils';

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '../../../test-helpers/cas11';

describe('Std > helpers > @token(tokenSymbol)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should interpret it correctly', async () => {
    const [interpret] = await preparingExpression('@token(DAI)', signer);

    expect(await interpret()).to.equals(
      '0x44fA8E6f47987339850636F88629646662444217',
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@token',
    ['DAI'],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazySigner,
  );
});
