import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

describe('Std > helpers > @get(contractAddress, method, params?)', () => {
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

  it.skip('should interpret it correctly', async () => {
    const sushiFarm = '0x44fA8E6f47987339850636F88629646662444217';
    const [interpret] = await preparingExpression(
      `@get(${sushiFarm},"poolInfo(uint256):(uint128,uint64,uint64):1",1)`,
      signer,
    );

    expect(await interpret()).to.be.greaterThanOrEqual('1671364630');
  });

  it('should interpret it correctly', async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, balanceOf(address):(uint), ${targetAddress})`,
      signer,
    );

    expect(await interpret()).not.to.be.eq('0');
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@get',
    [targetAddress, 'name():(string)'],
    {
      type: ComparisonType.Greater,
      minValue: 2,
    },
    lazySigner,
  );
});
