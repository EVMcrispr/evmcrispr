import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../../src/types';
import { ComparisonType } from '../../../../src/utils';

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '../../../test-helpers/cas11';

describe('Std > helpers > @get(contractAddress, method)', () => {
  let signer: Signer;
  const lazySigner = () => signer;
  const targetAddress = '0x44fA8E6f47987339850636F88629646662444217';

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should interpret it correctly', async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, name():(string))`,
      signer,
    );

    expect(await interpret()).to.eq('Dai Stablecoin on xDai');
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@get',
    [targetAddress, 'name():(string)'],
    {
      type: ComparisonType.Equal,
      minValue: 2,
    },
    lazySigner,
  );
});
