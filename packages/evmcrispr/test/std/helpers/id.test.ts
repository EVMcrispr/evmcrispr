import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../src/types';
import { ComparisonType } from '../../../src/utils';

describe('Std > helpers > @id(value)', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('return the hashed value', async () => {
    const [interpret] = await preparingExpression(
      `@id('an example test')`,
      signer,
    );

    expect(await interpret()).to.equals(utils.id('an example test'));
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@id',
    ['exampleValue'],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazySigner,
  );
});
