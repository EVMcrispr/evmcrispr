import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { NodeType } from '../../../../src/types';
import { ComparisonType } from '../../../../src/utils';

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '../../../test-helpers/cas11';

export const tokenDescribe = (): Suite =>
  describe('@token(tokenSymbol)', () => {
    let signer: Signer;
    const lazySigner = () => signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should interpret it correctly', async () => {
      const [interpret] = await preparingExpression('@token(DAI)', signer);

      expect(await interpret()).to.equals(
        '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
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
