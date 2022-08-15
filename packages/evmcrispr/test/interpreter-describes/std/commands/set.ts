import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { BindingsSpace } from '../../../../src/cas11/interpreter/BindingsManager';
import { CommandError } from '../../../../src/errors';
import { toDecimals } from '../../../../src/utils';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

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

    it('should fail when setting an invalid variable identifier', async () => {
      const error = new CommandError('set', 'expected a variable identifier');

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
       set var1 12e18
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when setting an already-defined variable', async () => {
      const error = new CommandError('set', '$var1 already defined');

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
       set $var1 12e18
       set $var1 "new"
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
