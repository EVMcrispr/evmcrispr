import { expect } from 'chai';
import type { Signer } from 'ethers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

import { ExpressionError } from '../../src/errors';

import { toDecimals } from '../../src/utils';

import { createInterpreter, runExpression } from '../test-helpers/cas11';
import { expectThrowAsync } from '../test-helpers/expects';

export const arithmeticDescribe = (): Mocha.Suite =>
  describe('arithmetic interpreter', () => {
    const name = 'ArithmeticExpression';
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should return the correct result of an arithmetic operation', async () => {
      const res = await runExpression('(120 - 5 * 4 + 500)', signer);

      expect(res).to.eql(BigNumber.from(600));
    });

    it('should return the correct result of an arithmetic operation containing priority parenthesis', async () => {
      const res = await runExpression(
        '((121e18 / 4) * (50 - 2) - 55e18)',
        signer,
      );

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
        {
          type: leftOperandErr.constructor,
          message: leftOperandErr.message,
          name: leftOperandErr.name,
        },
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
        {
          type: rightOperandErr.constructor,
          message: rightOperandErr.message,
          name: rightOperandErr.name,
        },
        'invalid right operand error',
      );
    });

    it('should fail when trying to perform a division by zero', async () => {
      const err = new ExpressionError(
        `invalid operation. Can't divide by zero`,
        { name },
      );

      await expectThrowAsync(() => runExpression('(4 / 0)', signer), {
        type: err.constructor,
        message: err.message,
        name: err.name,
      });
    });
  });
