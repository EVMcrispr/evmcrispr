import "../../setup";
import { beforeAll, expect, test } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import {
  arrayLengthParam,
  arrayValuesParam,
  canonicalArgSpec,
  collectionReadParam,
  constraint,
  encodeResolve,
  type InputParam,
  packedArrayOperand,
  rawParam,
} from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
} from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";

const client = getPublicClient();
beforeAll(() => installAssertionsCore(client));
const element = { type: "string" } as const;
const encodeString = (value: string) => encodeAbiParameters([element], [value]);
const encodeValues = (values: readonly Hex[]) =>
  encodeAbiParameters([{ type: "bytes[]" }], [values]);

async function setup(values = [encodeString("a")], validated = true) {
  const { ctx } = await compileExpression('@reverse!(["a"])', {
    module: "lang",
  });
  const input = rawParam(encodeValues(values));
  const operand = packedArrayOperand(ctx, input, element, { validated });
  if (operand.kind !== "call") throw new Error("expected call");
  const array = { param: operand.param, element };
  const resolve = async (param: InputParam) =>
    (await client.call({ to: ctx.core, data: encodeResolve(param) }))
      .data as Hex;
  return { ctx, input, array, resolve };
}

test("untrusted values retain whole-array validation before an empty slice", async () => {
  const { ctx, array, resolve } = await setup([encodeString("a"), "0x"], false);
  const empty = collectionReadParam(ctx, "sliceValues", [
    { kind: "value", value: "string" },
    canonicalArgSpec(ctx, { type: "bytes[]" }, arrayValuesParam(ctx, array)),
    { kind: "value", value: Num(0) },
    { kind: "value", value: Num(0) },
  ]);
  await expect(resolve(empty)).rejects.toThrow();
});

test("constraints on a materialized array cannot be bypassed by its values view", async () => {
  const { ctx, array, resolve } = await setup();
  array.param.constraints.push(constraint("Eq", 99n));
  await expect(resolve(arrayValuesParam(ctx, array))).rejects.toThrow();
  await expect(resolve(arrayLengthParam(ctx, array))).rejects.toThrow();
});

test("changing an array operand invalidates its old values view", async () => {
  for (const inPlace of [false, true]) {
    const { ctx, array, resolve } = await setup();
    const updated = rawParam(
      encodeAbiParameters([{ type: "string[]" }], [["b"]]),
    );
    if (inPlace) Object.assign(array.param, updated);
    else array.param = updated;
    const result = await resolve(arrayValuesParam(ctx, array));
    expect(decodeAbiParameters([{ type: "bytes[]" }], result)[0]).toEqual([
      encodeString("b"),
    ]);
  }
});

test("values views snapshot their source and do not expose mutable cached operands", async () => {
  const { ctx, input, array, resolve } = await setup();
  input.paramData = encodeValues([encodeString("wrong")]);
  const first = arrayValuesParam(ctx, array);
  first.constraints.push(constraint("Eq", 99n));
  const result = await resolve(arrayValuesParam(ctx, array));
  expect(decodeAbiParameters([{ type: "bytes[]" }], result)[0]).toEqual([
    encodeString("a"),
  ]);
});
