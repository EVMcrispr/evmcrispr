import { expect } from 'chai';
import type { Signer } from 'ethers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

import { ExpressionError } from '../../src/errors';

import { toDecimals } from '../../src/utils';

import { createInterpreter, preparingExpression } from '../test-helpers/cas11';
import { expectThrowAsync } from '../test-helpers/expects';

export const arithmeticDescribe = (): Mocha.Suite =>
  describe('arithmetic interpreter', () => {
    const name = 'ArithmeticExpression';
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should return the correct result of an arithmetic operation', async () => {
      const [interpret] = await preparingExpression(
        '(120 - 5 * 4 + 500)',
        signer,
      );
      const res = await interpret();

      expect(res).to.eql(BigNumber.from(600));
    });

    it('should return the correct result of an arithmetic operation containing priority parenthesis', async () => {
      const [interpret] = await preparingExpression(
        '((121e18 / 4) * (50 - 2) - 55e18)',
        signer,
      );
      const res = await interpret();

      expect(res).to.eql(toDecimals(1397, 18));
    });

    it('should fail when one of the operands is not a number', async () => {
      const invalidValue = 'a string';
      const leftOperandErr = new ExpressionError(
        `invalid left operand. Expected a number but got "${invalidValue}"`,
        { name },
      );
      const rightOperandErr = new ExpressionError(
        `invalid right operand. Expected a number but got "${invalidValue}"`,
        { name },
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        set $var1 "${invalidValue}"

        set $res ($var1 * 2)
      `,
            signer,
          ).interpret(),
        leftOperandErr,
        'invalid left operand error',
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        set $var1 "${invalidValue}"

        set $res (2 * $var1)
      `,
            signer,
          ).interpret(),
        rightOperandErr,
        'invalid right operand error',
      );
    });

    it('should fail when trying to perform a division by zero', async () => {
      const [interpret] = await preparingExpression('(4 / 0)', signer);
      const err = new ExpressionError(
        `invalid operation. Can't divide by zero`,
        { name },
      );

      await expectThrowAsync(() => interpret(), err);
    });
  });
