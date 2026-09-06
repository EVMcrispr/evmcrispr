import "../../setup";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  cmpCombine,
  constOperand,
  encodeResolve,
} from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";

const SOURCE = "0x0000000000000000000000000000000000ba9876";
const client = getPublicClient();
beforeAll(() => installAssertionsCore(client));
async function resolve(expression: string, type: string) {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
  });
  if (operand.kind !== "call") throw new Error("expected live expression");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return {
    value: decodeAbiParameters([{ type } as never], data as Hex)[0] as unknown,
    operand,
  };
}
describe("arithmetic and bytes parity gaps", () => {
  test("signed sums retain negative values and signed provenance", async () => {
    for (const [values, expected] of [
      [[-2n, 3n], 1n],
      [[-1n], -1n],
      [[], 0n],
    ] as const) {
      await installConstantMock(
        client,
        SOURCE,
        encodeAbiParameters([{ type: "int256[]" }], [values]),
      );
      const result = await resolve(
        `@sum!(${SOURCE}::{values()(int256[])})`,
        "int256",
      );
      expect(result.value).toBe(expected);
      expect(result.operand.cat).toBe("Int");
    }
  });
  test("signed sums revert on checked overflow", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "int256[]" }], [[(1n << 255n) - 1n, 1n]]),
    );
    await expect(
      resolve(`@sum!(${SOURCE}::{values()(int256[])})`, "int256"),
    ).rejects.toThrow();
  });
  test("sum rejects nonnumeric arrays", async () => {
    await expect(
      compileExpression(`@sum!(${SOURCE}::{values()(bool[])})`, {
        module: "lang",
      }),
    ).rejects.toThrow("numeric");
  });
  test("nested bytes equality compares the entire payload", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes" }], ["0x001122"]),
    );
    for (const [literal, expected] of [
      ["0x001122", true],
      ["0x1122", false],
      ["0x", false],
    ] as const) {
      const { operand: source, ctx } = await compileExpression(
        `${SOURCE}::{value()(bytes)}`,
      );
      const operand = cmpCombine(ctx, "Eq", source, constOperand(literal));
      if (operand.kind !== "call") throw new Error("expected live comparison");
      const { data } = await client.call({
        to: ctx.core,
        data: encodeResolve(operand.param),
      });
      const result = {
        value: decodeAbiParameters([{ type: "bool" }], data as Hex)[0],
      };
      expect(result.value).toBe(expected);
    }
  });
});
