import "../../setup";
import { beforeAll, expect, test } from "bun:test";
import { expWad, lnWad } from "@evmcrispr/sdk";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import {
  type AbiParameter,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
} from "viem";

const SOURCE = "0x0000000000000000000000000000000000ba9877";
const client = getPublicClient();
beforeAll(() => installAssertionsCore(client));
async function resolve(name: string, value: bigint, type = "int256") {
  await installConstantMock(
    client,
    SOURCE,
    encodeAbiParameters([{ type } as AbiParameter], [value]),
  );
  const { operand, ctx } = await compileExpression(
    `@${name}!(${SOURCE}::{value()(${type})})`,
    { module: "math" },
  );
  if (operand.kind !== "call") throw new Error("expected a live operand");
  expect(operand.scale).toBe(18);
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters([{ type: "int256" }], data as Hex)[0];
}
test("live exp and ln match the SDK integer algorithms", async () => {
  for (const value of [-(10n ** 18n), 0n, 10n ** 18n]) {
    expect(await resolve("exp", value)).toBe(expWad(value));
  }
  for (const value of [1n, 10n ** 18n, 2n * 10n ** 18n]) {
    expect(await resolve("ln", value)).toBe(lnWad(value));
  }
});
test("live logarithm rejects zero and unsigned values outside int256", async () => {
  await expect(resolve("ln", 0n)).rejects.toThrow();
  await expect(resolve("ln", 1n << 255n, "uint256")).rejects.toThrow();
  await expect(resolve("exp", 1n << 255n, "uint256")).rejects.toThrow();
});
