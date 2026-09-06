import "../../setup";
import { beforeAll, describe, expect, test } from "bun:test";
import { encodeResolve, OPERATIONS_ADDRESS } from "@evmcrispr/sdk/onchain";
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

const source = "0x00000000000000000000000000000000000d0100";
const indexSource = "0x00000000000000000000000000000000000d0101";
const predicate = "0x00000000000000000000000000000000000d0102";
const other = "0x00000000000000000000000000000000000d0103";
const client = getPublicClient();
beforeAll(async () => {
  await installAssertionsCore(client);
});
async function execute(
  expression: string,
  type: AbiParameter,
  preamble = "",
): Promise<unknown> {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
    preamble,
  });
  if (operand.kind !== "call") throw new Error("expected live expression");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters([type], data as Hex)[0];
}
describe("generic collection consumers", () => {
  test("reverse and clamped slice preserve dynamic elements", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "bb", "ccc"]]),
    );
    const arr = `${source}::{values()(string[])}`;
    expect(await execute(`@reverse!(${arr})`, { type: "string[]" })).toEqual([
      "ccc",
      "bb",
      "a",
    ]);
    expect(await execute(`@slice!(${arr} -9 2)`, { type: "string[]" })).toEqual(
      ["a", "bb"],
    );
    expect(await execute(`@slice!(${arr} 2 1)`, { type: "string[]" })).toEqual(
      [],
    );
    expect(await execute(`@slice!(${arr} 9)`, { type: "string[]" })).toEqual(
      [],
    );
  });
  test("at and slice indices remain live after compilation", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "bb", "ccc"]]),
    );
    await installConstantMock(
      client,
      indexSource,
      encodeAbiParameters([{ type: "int256" }], [0n]),
    );
    const arr = `${source}::{values()(string[])}`;
    const index = `${indexSource}::{index()(int256)}`;
    const compiled = await compileExpression(`@at!(${arr} ${index})`, {
      module: "lang",
    });
    const sliced = await compileExpression(`@slice!(${arr} ${index})`, {
      module: "lang",
    });
    await installConstantMock(
      client,
      indexSource,
      encodeAbiParameters([{ type: "int256" }], [-1n]),
    );
    for (const [result, type, want] of [
      [compiled, { type: "string" }, "ccc"],
      [sliced, { type: "string[]" }, ["ccc"]],
    ] as const) {
      if (result.operand.kind !== "call") throw new Error("expected call");
      const { data } = await client.call({
        to: result.ctx.core,
        data: encodeResolve(result.operand.param),
      });
      expect(decodeAbiParameters([type], data as Hex)[0] as unknown).toEqual(
        want,
      );
    }
  });
  test("any/all/find short circuit before a later reverting predicate", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x61", "0x62"]]),
    );
    await client.request({
      method: "anvil_setCode",
      params: [predicate, "0x60443560f81c606114600f575f5ffd5b60015f5260205ff3"],
    } as never);
    const arr = `${source}::{values()(bytes[])}`;
    const def = `def @p! "$x: bytes -> bool" ${predicate}::{test(bytes)(bool) $x}`;
    expect(await execute(`@any!(${arr} @p!)`, { type: "bool" }, def)).toBe(
      true,
    );
    expect(await execute(`@find!(${arr} @p!)`, { type: "bytes" }, def)).toBe(
      "0x61",
    );
    await client.request({
      method: "anvil_setCode",
      params: [predicate, "0x60443560f81c606114600f575f5ffd5b60005f5260205ff3"],
    } as never);
    expect(await execute(`@all!(${arr} @p!)`, { type: "bool" }, def)).toBe(
      false,
    );
  });
  test("empty quantifiers and absent find", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "bytes[]" }], [[]]),
    );
    const arr = `${source}::{values()(bytes[])}`;
    const def = `def @p! "$x: bytes -> bool" ${OPERATIONS_ADDRESS}::{charset(bytes,uint256)(bool) $x 0}`;
    expect(await execute(`@any!(${arr} @p!)`, { type: "bool" }, def)).toBe(
      false,
    );
    expect(await execute(`@all!(${arr} @p!)`, { type: "bool" }, def)).toBe(
      true,
    );
    await expect(
      execute(`@find!(${arr} @p!)`, { type: "bytes" }, def),
    ).rejects.toThrow();
  });
  test("zip dynamic lanes into canonical tuples", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "b"]]),
    );
    await installConstantMock(
      client,
      other,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x12", "0x3456"]]),
    );
    expect(
      await execute(
        `@zip!(${source}::{values()(string[])} ${other}::{values()(bytes[])})`,
        {
          type: "tuple[]",
          components: [{ type: "string" }, { type: "bytes" }],
        },
      ),
    ).toEqual([
      ["a", "0x12"],
      ["b", "0x3456"],
    ]);
  });
  test("generic includes compares canonical dynamic values", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "bc"]]),
    );
    await installConstantMock(
      client,
      other,
      encodeAbiParameters([{ type: "string" }], ["bc"]),
    );
    const arr = `${source}::{values()(string[])}`;
    expect(await execute(`@includes!(${arr} "a")`, { type: "bool" })).toBe(
      true,
    );
    expect(
      await execute(`@includes!(${arr} ${other}::{value()(string)})`, {
        type: "bool",
      }),
    ).toBe(true);
    expect(await execute(`@includes!(${arr} "no")`, { type: "bool" })).toBe(
      false,
    );
  });
  test("generic zip lanes preserve dynamic components", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "b"]]),
    );
    await installConstantMock(
      client,
      other,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x12", "0x3456"]]),
    );
    const zipped = `@zip!(${source}::{values()(string[])} ${other}::{values()(bytes[])})`;
    expect(await execute(`@keys!(${zipped})`, { type: "string[]" })).toEqual([
      "a",
      "b",
    ]);
    expect(await execute(`@values!(${zipped})`, { type: "bytes[]" })).toEqual([
      "0x12",
      "0x3456",
    ]);
  });
  test("fixed arrays of dynamic elements normalize without changing values", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[2]" }], [["a", "bb"]]),
    );
    expect(
      await execute(`@reverse!(${source}::{values()(string[2])})`, {
        type: "string[]",
      }),
    ).toEqual(["bb", "a"]);
  });
  test("unzip without a lane returns both lanes", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "b"]]),
    );
    await installConstantMock(
      client,
      other,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x12", "0x3456"]]),
    );
    const zipped = `@zip!(${source}::{values()(string[])} ${other}::{values()(bytes[])})`;
    expect(
      await execute(`@unzip!(${zipped})`, {
        type: "tuple",
        components: [{ type: "string[]" }, { type: "bytes[]" }],
      }),
    ).toEqual([
      ["a", "b"],
      ["0x12", "0x3456"],
    ]);
    expect(
      await execute(`@at!(@unzip!(${zipped}) -1)`, { type: "bytes[]" }),
    ).toEqual(["0x12", "0x3456"]);
  });
  test("word consumers compose with slice, find and no-lane unzip", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "uint256[]" }], [[1n, 2n, 3n]]),
    );
    const arr = `${source}::{values()(uint256[])}`;
    const def = 'def @ge2! "$x: number -> bool" @bool!($x >= 2)';
    expect(
      await execute(`@find!(${arr} @ge2!)`, { type: "uint256" }, def),
    ).toBe(2n);
    expect(
      await execute(`@len!(@slice!(${arr} 1 3))`, { type: "uint256" }),
    ).toBe(2n);
    expect(
      await execute(`@unzip!(@zip!(${arr} [4 5 6]))`, {
        type: "tuple",
        components: [{ type: "uint256[]" }, { type: "uint256[]" }],
      }),
    ).toEqual([
      [1n, 2n, 3n],
      [4n, 5n, 6n],
    ]);
  });
  test("generic zip rejects unequal lengths", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "b"]]),
    );
    await installConstantMock(
      client,
      other,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x12"]]),
    );
    await expect(
      execute(
        `@zip!(${source}::{values()(string[])} ${other}::{values()(bytes[])})`,
        {
          type: "tuple[]",
          components: [{ type: "string" }, { type: "bytes" }],
        },
      ),
    ).rejects.toThrow();
  });
  test("composed folds preserve dynamic and repeated accumulators", async () => {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [["a", "b"]]),
    );
    const initial = "long accumulator spanning more than a single EVM word";
    const once = `${initial}a${initial}`;
    expect(
      await execute(
        `@reduce!(${source}::{values()(string[])} @join! "${initial}")`,
        { type: "string" },
        'def @join! "$acc: string $x: string -> string" @str.concat!($acc $x $acc)',
      ),
    ).toBe(`${once}b${once}`);
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "uint256[]" }], [[1n, 2n]]),
    );
    expect(
      await execute(
        `@reduce!(${source}::{values()(uint256[])} @twice! 0)`,
        { type: "uint256" },
        'def @twice! "$acc: number $x: number -> number" @calc!($acc + $acc + $x)',
      ),
    ).toBe(4n);
  });
});
