import {
  createInterpreter,
  expectThrowAsync,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

import { ExpressionError } from '../../src/errors';

import { toDecimals } from '../../src/utils';

describe('Interpreter - arithmetics', () => {
  const name = 'ArithmeticExpressionError';
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should return the correct result of an arithmetic operation', async () => {
    const [interpret] = await preparingExpression(
      '(120 - 5e22 * 2 ^ 2 + 500e33)',
      signer,
    );
    const res = await interpret();

    expect(res).to.eql(
      BigNumber.from(120).sub(toDecimals(20, 22)).add(toDecimals(500, 33)),
    );
  });

  it('should return the correct result of an arithmetic operation containing priority parenthesis', async () => {
    const [interpret] = await preparingExpression(
      '((121e18 / 4) * (9 - 2) ^ 2 - 55e18)',
      signer,
    );
    const res = await interpret();

    expect(res).to.eql(toDecimals('1427.25', 18));
  });

  it('should fail when one of the operands is not a number', async () => {
    const invalidValue = 'a string';
    const leftOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res ($var1 * 2)
  `,
      signer,
    );
    const leftOperandNode = leftOperandInterpreter.ast.body[1].args[1];
    const leftOperandErr = new ExpressionError(
      leftOperandNode,
      `invalid left operand. Expected a number but got "${invalidValue}"`,
      { name },
    );

    const rightOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res (2 * $var1)
  `,
      signer,
    );
    const rightOperandNode = rightOperandInterpreter.ast.body[1].args[1];
    const rightOperandErr = new ExpressionError(
      rightOperandNode,
      `invalid right operand. Expected a number but got "${invalidValue}"`,
      { name },
    );

    await expectThrowAsync(
      () => leftOperandInterpreter.interpret(),
      leftOperandErr,
      'invalid left operand error',
    );

    await expectThrowAsync(
      () => rightOperandInterpreter.interpret(),
      rightOperandErr,
      'invalid right operand error',
    );
  });

  it('should fail when trying to perform a division by zero', async () => {
    const [interpret, n] = await preparingExpression('(4 / 0)', signer);
    const err = new ExpressionError(
      n,
      `invalid operation. Can't divide by zero`,
      { name },
    );

    await expectThrowAsync(() => interpret(), err);
  });
});
