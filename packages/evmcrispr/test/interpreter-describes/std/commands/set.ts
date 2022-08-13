import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { BindingsSpace } from '../../../../src/cas11/interpreter/BindingsManager';
import { toDecimals } from '../../../../src/utils';
import { createInterpreter } from '../../../test-helpers/cas11';

export const setDescribe = (): Suite =>
  describe('when interpreting set command', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should set an user variable correctly', async () => {
      const interpreter = createInterpreter('set $var 1e18', signer);

      await interpreter.interpret();

      expect(interpreter.getBinding('$var', BindingsSpace.USER)).to.be.equal(
        toDecimals(1, 18),
      );
    });
  });
