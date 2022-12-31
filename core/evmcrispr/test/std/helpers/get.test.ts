import {
  WALLETS,
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import type { Signer } from 'ethers';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

describe('Std > helpers > @get(contractAddress, method, params?)', () => {
  let signer: Signer;
  const lazySigner = () => signer;
  const targetAddress = '0x44fA8E6f47987339850636F88629646662444217';

  beforeAll(() => {
    [signer] = WALLETS;
  });

  it('should get a single value from a non-param-receiving function correctly', async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, name():(string))`,
      signer,
    );

    expect(await interpret()).to.eq('Dai Stablecoin on xDai');
  });

  it('should get a single value from param-receiving function correctly', async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, balanceOf(address):(uint), ${targetAddress})`,
      signer,
    );

    expect(await interpret()).not.to.be.eq('0');
  });

  it('should get a collection of values from a function correctly', async () => {
    const sushiFarm = '0xdDCbf776dF3dE60163066A5ddDF2277cB445E0F3';
    const [interpret] = await preparingExpression(
      `@get(${sushiFarm},"poolInfo(uint256):(uint128,uint64,uint64):1",1)`,
      signer,
    );

    expect((await interpret()).toNumber()).to.be.greaterThanOrEqual(1672406185);
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
