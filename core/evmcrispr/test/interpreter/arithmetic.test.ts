import type { Case } from '@1hive/evmcrispr-test-common';
import {
  createInterpreter,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import type { Signer } from 'ethers';
import { BigNumber } from 'ethers';

import { toDecimals } from '../../src/utils';

describe.concurrent('Interpreter - arithmetics', () => {
  let signer: Signer;

  beforeAll(async (ctx) => {
    [signer] = await ctx.file!.utils.getWallets();
  });

  describe.concurrent.each<Case>([
    {
      title: '',
      value: '(120 - 5e22 * 2 ^ 2 + 500e33)',
      expected: BigNumber.from(120)
        .sub(toDecimals(20, 22))
        .add(toDecimals(500, 33)),
    },
    {
      title: 'containing priority parentheses',
      value: '((121e18 / 4) * (9 - 2) ^ 2 - 55e18)',
      expected: toDecimals('1427.25', 18),
    },
  ])('', ({ title, value, expected }) => {
    it(`should return the correct result of an arithmetic operation ${title}`, async () => {
      const [interpret] = await preparingExpression(value, signer);
      const res = await interpret();

      expect(res).to.eql(expected!);
    });
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
    const rightOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res (2 * $var1)
  `,
      signer,
    );

    await expect(
      leftOperandInterpreter.interpret(),
    ).rejects.toMatchInlineSnapshot(
      '[ArithmeticExpressionError: ArithmeticExpressionError(4:14,4:-4): invalid left operand. Expected a number but got "a string"]',
    );

    await expect(
      rightOperandInterpreter.interpret(),
    ).rejects.toMatchInlineSnapshot(
      '[ArithmeticExpressionError: ArithmeticExpressionError(4:14,4:-4): invalid right operand. Expected a number but got "a string"]',
    );
  });

  it('should fail when trying to perform a division by zero', async () => {
    const [interpret] = await preparingExpression('(4 / 0)', signer);

    // TODO: fix end column location which is smaller than start column location
    await expect(interpret()).rejects.toMatchInlineSnapshot(
      "[ArithmeticExpressionError: ArithmeticExpressionError(5:12,5:9): invalid operation. Can't divide by zero]",
    );
  });
});
