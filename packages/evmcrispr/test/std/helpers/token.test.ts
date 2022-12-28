import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

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

describe('Std > helpers > @token.balance(tokenSymbol, account)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should interpret it correctly', async () => {
    const [interpret] = await preparingExpression(
      '@token.balance(DAI,@token(DAI))',
      signer,
    );

    expect(await interpret()).to.be.eq(
      '12100000000000000000', // DAI balance in block 24730000, may change for other blocks
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@token.balance',
    ['DAI', '@token(DAI)'],
    {
      type: ComparisonType.Equal,
      minValue: 2,
    },
    lazySigner,
  );
});

describe('Std > helpers > @token.amount(tokenSymbol, amount)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should interpret it correctly', async () => {
    const [interpret] = await preparingExpression(
      '@token.amount(DAI, 1)',
      signer,
    );

    expect(await interpret()).to.equals(String(1e18));
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@token.amount',
    ['DAI', '1'],
    {
      type: ComparisonType.Equal,
      minValue: 2,
    },
    lazySigner,
  );
});
