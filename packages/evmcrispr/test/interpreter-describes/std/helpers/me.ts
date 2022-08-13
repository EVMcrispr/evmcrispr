import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { NodeType } from '../../../../src/cas11/types';
import { ComparisonType } from '../../../../src/cas11/utils';
import {
  itChecksInvalidArgsLength,
  runExpression,
} from '../../../test-helpers/cas11';

export const meDescribe = (): Suite =>
  describe('@me', () => {
    let signer: Signer;
    const lazySigner = () => signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should return the current connected account', async () => {
      const connectedAccount = await runExpression(`@me`, signer);

      expect(connectedAccount).to.equals(await signer.getAddress());
    });

    itChecksInvalidArgsLength(
      NodeType.HelperFunctionExpression,
      '@me',
      [],
      { type: ComparisonType.Equal, minValue: 0 },
      lazySigner,
    );
  });
