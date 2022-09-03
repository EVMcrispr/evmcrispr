import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { NodeType } from '../../../../src/cas11/types';
import { ComparisonType } from '../../../../src/cas11/utils';

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '../../../test-helpers/cas11';

export const idDescribe = (): Suite =>
  describe('@id(value)', () => {
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
