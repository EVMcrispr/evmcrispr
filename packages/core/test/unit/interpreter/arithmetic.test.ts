import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../setup.js";

import { ExpressionError, Num } from "@evmcrispr/sdk";
import {
  createInterpreter,
  expectThrowAsync,
  getPublicClient,
  preparingExpression,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

describe("Interpreter - arithmetics", () => {
  const name = "ArithmeticExpressionError";

  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should return the correct result of an arithmetic operation", async () => {
    const [interpret] = await preparingExpression(
      "(120 - 5e22 * 2 ^ 2 + 500e33)",
      client,
    );
    const res = await interpret();

    // 120 - 5*10^22 * 4 + 500*10^33
    const expected = Num.fromBigInt(120n)
      .sub(
        Num.fromDecimalString("5")
          .mul(new Num(10n ** 22n, 1n))
          .mul(Num.fromBigInt(4n)),
      )
      .add(Num.fromDecimalString("500").mul(new Num(10n ** 33n, 1n)));
    expect(res).to.be.instanceOf(Num);
    expect((res as Num).eq(expected)).to.be.true;
  });

  it("should return the correct result of an arithmetic operation containing priority parenthesis", async () => {
    const [interpret] = await preparingExpression(
      "((121e18 / 4) * (9 - 2) ^ 2 - 55e18)",
      client,
    );
    const res = await interpret();

    // (121*10^18 / 4) * 7^2 - 55*10^18 = 121*10^18/4 * 49 - 55*10^18
    const expected = Num.fromDecimalString("121")
      .mul(new Num(10n ** 18n, 1n))
      .div(Num.fromBigInt(4n))
      .mul(Num.fromBigInt(49n))
      .sub(Num.fromDecimalString("55").mul(new Num(10n ** 18n, 1n)));
    expect(res).to.be.instanceOf(Num);
    expect((res as Num).eq(expected)).to.be.true;
  });

  it("should fail when one of the operands is not a number", async () => {
    const invalidValue = "a string";
    const leftOperandInterpreter = createInterpreter(
      `
    set $var1 "${invalidValue}"

    set $res ($var1 * 2)
  `,
      client,
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
      client,
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
      "invalid left operand error",
    );

    await expectThrowAsync(
      () => rightOperandInterpreter.interpret(),
      rightOperandErr,
      "invalid right operand error",
    );
  });

  it("should fail when trying to perform a division by zero", async () => {
    const [interpret, n] = await preparingExpression("(4 / 0)", client);
    const err = new ExpressionError(
      n,
      `invalid operation. Can't divide by zero`,
      { name },
    );

    await expectThrowAsync(() => interpret(), err);
  });
});
