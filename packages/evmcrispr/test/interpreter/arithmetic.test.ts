import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { ExpressionError } from '../../src/errors';
import { BigDecimal } from '../../src/BigDecimal';

import { toDecimals } from '../../src/utils';

import { createInterpreter, preparingExpression } from '../test-helpers/cas11';
import { expectThrowAsync } from '../test-helpers/expects';

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
    const res: BigDecimal = await interpret();

    expect(res).to.eql(
      BigDecimal.from(120).sub(toDecimals(20, 22)).add(toDecimals(500, 33)),
    );
  });

  it('should return the correct result of an arithmetic operation containing priority parenthesis', async () => {
    const [interpret] = await preparingExpression(
      '((121e18 / 4) * (9 - 2) ^ 2 - 55e18)',
      signer,
    );
    const res: BigDecimal = await interpret();

    expect(res).to.deep.eq(toDecimals('1427.25', 18));
  });

  it('should return the correct result of an arithmetic operation containing decimals', async () => {
    const [interpret] = await preparingExpression(
      '((121 / 4) * (9 - 2) ^ 2 - 55)',
      signer,
    );
    const res: BigDecimal = await interpret();

    expect(res.toString()).to.eql('1427.25');
  });

  it('should return the floor amount when passed to hexadecimal to be used in ethers', async () => {
    const [interpret] = await preparingExpression('(0.9+0.9)', signer);
    const res: BigDecimal = await interpret();

    expect(BigDecimal.from(res.toHexString()).toString()).to.eql('1');
  });

  it('should return the correct result of an arithmetic operation containing a decimal exponent', async () => {
    const [interpret] = await preparingExpression(
      '(10000000 * (1 / 2) ^ (5 / 1000000))',
      signer,
    );
    const res: BigDecimal = await interpret();

    expect(res.toHexString()).to.eql(ethers.utils.hexlify(9999965));
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
