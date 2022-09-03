import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { BindingsSpace } from '../../../../src/BindingsManager';
import type { CommandExpressionNode } from '../../../../src/types';
import { CommandError } from '../../../../src/errors';
import { toDecimals } from '../../../../src/utils';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';
import { findStdCommandNode } from '../../../test-helpers/std';

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
      const interpreter = createInterpreter(
        `
   set var1 12e18
  `,
        signer,
      );
      const c = findStdCommandNode(interpreter.ast, 'set')!;
      const error = new CommandError(c, 'expected a variable identifier');

      await expectThrowAsync(() => interpreter.interpret(), error);
    });

    it('should fail when setting an already-defined variable', async () => {
      const interpreter = createInterpreter(
        `
        set $var1 12e18
        set $var1 "new"
      `,
        signer,
      );
      const c = interpreter.ast.body[1] as CommandExpressionNode;
      const error = new CommandError(c, '$var1 already defined');
      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  });
