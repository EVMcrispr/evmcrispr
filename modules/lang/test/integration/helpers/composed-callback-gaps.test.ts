import "../../setup";
import { beforeAll, expect, test } from "bun:test";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";

const client = getPublicClient();
const source = "0x00000000000000000000000000000000000d0200";
const target = "0x00000000000000000000000000000000000d0201";
beforeAll(async () => {
  await installAssertionsCore(client);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "string[]" }], [["a", "bc"]]),
  );
});
async function run(expression: string, preamble = "") {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
    preamble,
  });
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters([{ type: "string[]" }], data as Hex)[0];
}
test("composed callback repeats complete dynamic parameters", async () => {
  expect(
    await run(
      `@map!(${source}::{get()(string[])} @duplicate!)`,
      `def @duplicate! "$x: string -> string" @str.concat!($x $x)`,
    ),
  ).toEqual(["aa", "bcbc"]);
});
test("composed callback supports more than four live arguments", async () => {
  expect(
    await run(
      `@map!(${source}::{get()(string[])} @repeat!)`,
      `def @repeat! "$x: string -> string" @str.concat!($x $x $x $x $x $x)`,
    ),
  ).toEqual(["aaaaaa", "bcbcbcbcbcbc"]);
});
test("composed callback keeps conditional failure branch lazy", async () => {
  expect(
    await run(
      `@map!(${source}::{get()(string[])} @safe!)`,
      `def @safe! "$x: string -> string" @ifElse!(@str.len!($x) > 0 ? @str.concat!($x $x) : ${target}::{fail(string)(string) $x})`,
    ),
  ).toEqual(["aa", "bcbc"]);
});
test("callback call target stays live", async () => {
  await installConstantMock(
    client,
    target,
    encodeAbiParameters(
      [{ type: "address" }],
      ["0x00000000000000000000000000000000000d0202"],
    ),
  );
  await installConstantMock(
    client,
    "0x00000000000000000000000000000000000d0202",
    encodeAbiParameters([{ type: "string" }], ["ok"]),
  );
  const { operand, ctx } = await compileExpression(
    `@map!(${source}::{get()(string[])} @identity!)`,
    {
      module: "lang",
      preamble: `def @identity! "$x: string -> string" ${target}::{get()(address)}::{echo(string)(string) $x}`,
    },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  expect(decodeAbiParameters([{ type: "string[]" }], data as Hex)[0]).toEqual([
    "ok",
    "ok",
  ]);
});

test("composed fallback catches failure and evaluates only the selected branch", async () => {
  await client.request({
    method: "anvil_setCode",
    params: [target, "0x5f5ffd"],
  } as never);
  expect(
    await run(
      `@map!(${source}::{get()(string[])} @fallback!)`,
      `def @fallback! "$x: string -> string" @orElse!(${target}::{fail(string)(string) $x} @str.concat!($x $x))`,
    ),
  ).toEqual(["aa", "bcbc"]);
});
test("composed revert probe accepts full dynamic parameters", async () => {
  const revertTarget = "0x00000000000000000000000000000000000d0203";
  await client.request({
    method: "anvil_setCode",
    params: [revertTarget, "0x5f5ffd"],
  } as never);
  const { operand, ctx } = await compileExpression(
    `@map!(${source}::{get()(string[])} @probe!)`,
    {
      module: "lang",
      preamble: `def @probe! "$x: string -> bool" @reverts!(${revertTarget}::{fail(string)(string) $x})`,
    },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  expect(decodeAbiParameters([{ type: "bool[]" }], data as Hex)[0]).toEqual([
    true,
    true,
  ]);
});

test("composed selector-specific revert probe preserves original call wire", async () => {
  const revertTarget = "0x00000000000000000000000000000000000d0204";
  // Unauthorized() selector 0x82b42900, returned as four raw revert bytes.
  await client.request({
    method: "anvil_setCode",
    params: [revertTarget, "0x6382b4290060e01b5f5260045ffd"],
  } as never);
  const { operand, ctx } = await compileExpression(
    `@map!(${source}::{get()(string[])} @specific!)`,
    {
      module: "lang",
      preamble: `def @specific! "$x: string -> bool" @reverts!(${revertTarget}::{fail(string)(string) $x} -!> Unauthorized())`,
    },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  expect(decodeAbiParameters([{ type: "bool[]" }], data as Hex)[0]).toEqual([
    true,
    true,
  ]);
});

test("composed callback repeats a full multiword tuple", async () => {
  const tupleSource = "0x00000000000000000000000000000000000d0205";
  const tuple = {
    type: "tuple",
    components: [{ type: "uint256" }, { type: "string" }],
  } as const;
  const value = [
    7n,
    "a string longer than one ABI word: abcdefghijklmnop",
  ] as const;
  await installConstantMock(
    client,
    tupleSource,
    encodeAbiParameters([{ ...tuple, type: "tuple[]" }], [[value]]),
  );
  const { operand, ctx } = await compileExpression(
    `@map!(${tupleSource}::{get()((uint256,string)[])} @pair!)`,
    {
      module: "lang",
      preamble: `def @pair! "$x: (uint256,string) -> bytes" @abi.encode!("(uint256,string),(uint256,string)" $x $x)`,
    },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  expect(decodeAbiParameters([{ type: "bytes[]" }], data as Hex)[0]).toEqual([
    encodeAbiParameters([tuple, tuple], [value, value]),
  ]);
});

test("word extraction rejects trailing data beyond the declared array count", async () => {
  const malformed = "0x00000000000000000000000000000000000d0206";
  const encoded = encodeAbiParameters([{ type: "uint256[]" }], [[1n]]);
  await installConstantMock(
    client,
    malformed,
    `${encoded}${"0".repeat(63)}2` as Hex,
  );
  const { operand, ctx } = await compileExpression(
    `@sum!(${malformed}::{get()(uint256[])})`,
    { module: "lang" },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  await expect(
    client.call({ to: ctx.core, data: encodeResolve(operand.param) }),
  ).rejects.toThrow();
});

test("generic callback may return a constant without using its parameter", async () => {
  expect(
    await run(
      `@map!(${source}::{get()(string[])} @constant!)`,
      `def @constant! "$x: string -> string" "fixed"`,
    ),
  ).toEqual(["fixed", "fixed"]);
});
