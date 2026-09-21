import "../../setup";
import { beforeAll, expect, test } from "bun:test";
import type { Num } from "@evmcrispr/sdk";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
  runExpression,
} from "@evmcrispr/test-utils/onchain";
import {
  type AbiParameter,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
} from "viem";

const client = getPublicClient();
const source = "0x00000000000000000000000000000000000e0700";
beforeAll(() => installAssertionsCore(client));

async function execute(
  expression: string,
  output: AbiParameter,
  preamble = "",
) {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
    preamble,
  });
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  if (operand.collection?.transport === "words") {
    const bytes = decodeAbiParameters(
      [{ type: "bytes" }],
      data as Hex,
    )[0].slice(2);
    const element = {
      ...output,
      type: output.type.slice(0, -2),
    } as AbiParameter;
    return (bytes.match(/.{64}/g) ?? []).map(
      (word) => decodeAbiParameters([element], `0x${word}`)[0],
    );
  }
  return decodeAbiParameters([output], data as Hex)[0];
}

test("map, filter and sort accept homogeneous literals and preserve signedness", async () => {
  expect(
    await execute(
      "@map!([1 -2 3] @twice!)",
      { type: "int256[]" },
      'def @twice! "$x: number -> number" @calc!($x * 2)',
    ),
  ).toEqual([2n, -4n, 6n]);
  expect(
    await execute(
      '@filter!(["" "a" "long"] @nonempty!)',
      { type: "string[]" },
      'def @nonempty! "$x: string -> bool" @bool!(@str.len!($x) > 0)',
    ),
  ).toEqual(["a", "long"]);
  const cmp = 'def @cmp! "$a: number $b: number -> int256" @calc!($a - $b)';
  expect(
    await execute("@sort!([1 -2 3] @cmp!)", { type: "int256[]" }, cmp),
  ).toEqual([-2n, 1n, 3n]);
  expect(await execute("@sort!([1 -2 3])", { type: "int256[]" })).toEqual([
    -2n,
    1n,
    3n,
  ]);
});

test("fixed arrays normalize words and dynamic elements", async () => {
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "int256[3]" }], [[1n, -2n, 3n]]),
  );
  const words = `${source}::{items()(int256[3])}`;
  expect(
    await execute(
      `@map!(${words} @twice!)`,
      { type: "int256[]" },
      'def @twice! "$x: number -> number" @calc!($x * 2)',
    ),
  ).toEqual([2n, -4n, 6n]);
  expect(await execute(`@unique!(${words})`, { type: "int256[]" })).toEqual([
    1n,
    -2n,
    3n,
  ]);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "string[3]" }], [["", "a", "a"]]),
  );
  const strings = `${source}::{items()(string[3])}`;
  expect(
    await execute(
      `@filter!(${strings} @nonempty!)`,
      { type: "string[]" },
      'def @nonempty! "$x: string -> bool" @bool!(@str.len!($x) > 0)',
    ),
  ).toEqual(["a", "a"]);
  expect(await execute(`@unique!(${strings})`, { type: "string[]" })).toEqual([
    "",
    "a",
  ]);
});

test("generic unique has default equality with run/compile parity", async () => {
  for (const [literal, type, expected] of [
    ['["a" "b" "a" ""]', "string[]", ["a", "b", ""]],
    ["[0x12 0x1234 0x12 0x]", "bytes[]", ["0x12", "0x1234", "0x"]],
    ['[["a"] [] ["a"] ["b"]]', "string[][]", [["a"], [], ["b"]]],
  ] as const) {
    const run = await runExpression(`@lang:unique(${literal})`, {
      module: "lang",
    });
    expect(run).toEqual(expected);
    expect(await execute(`@unique!(${literal})`, { type })).toEqual(run);
  }
  expect(
    await execute("@unique!([[1] [-2] [] [1]])", { type: "int256[][]" }),
  ).toEqual([[1n], [-2n], []]);
});

test("generic unique compares complete dynamic tuples", async () => {
  const tuple = {
    type: "tuple[]",
    components: [{ type: "uint256" }, { type: "string" }],
  } as const;
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(
      [tuple],
      [
        [
          [1n, "a"],
          [1n, "b"],
          [1n, "a"],
          [2n, "a"],
        ],
      ],
    ),
  );
  expect(
    await execute(`@unique!(${source}::{items()((uint256,string)[])})`, tuple),
  ).toEqual([
    [1n, "a"],
    [1n, "b"],
    [2n, "a"],
  ]);
});

test("custom equality still controls generic unique", async () => {
  expect(
    await execute(
      '@unique!(["a" "A" "b"] @same!)',
      { type: "string[]" },
      'def @same! "$a: string $b: string -> bool" @bool!(@str.lower!($a) == @str.lower!($b))',
    ),
  ).toEqual(["a", "b"]);
});

test("empty and incompatible literals have consistent typing", async () => {
  expect(
    await execute(
      "@map!([] @twice!)",
      { type: "uint256[]" },
      'def @twice! "$x: number -> number" @calc!($x * 2)',
    ),
  ).toEqual([]);
  expect(await execute("@unique!([])", { type: "uint256[]" })).toEqual([]);
  for (const expr of ['@unique!([1 "a"])', '@map!([1 "a"] @twice!)']) {
    await expect(
      compileExpression(expr, {
        module: "lang",
        preamble: 'def @twice! "$x: number -> number" @calc!($x * 2)',
      }),
    ).rejects.toThrow("ABI-compatible type");
  }
});

test("zip uses every literal element to infer lane signedness", async () => {
  expect(
    await execute("@values!(@zip!([1 2] [3 -4]))", { type: "int256[]" }),
  ).toEqual([3n, -4n]);
});

test("concat and literal flat share generic and signed array normalization", async () => {
  expect(
    await execute('@concat!(["a"] [] ["b" "c"])', { type: "string[]" }),
  ).toEqual(["a", "b", "c"]);
  expect(
    await execute('@flat!([["a"] [] ["b" "c"]])', { type: "string[]" }),
  ).toEqual(["a", "b", "c"]);
  expect(await execute("@flat!([])", { type: "uint256[]" })).toEqual([]);
  expect(await execute("@concat!([1] [-2])", { type: "int256[]" })).toEqual([
    1n,
    -2n,
  ]);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "int256[2]" }], [[-3n, 4n]]),
  );
  expect(
    await execute(`@flat!([${source}::{items()(int256[2])} [5]])`, {
      type: "int256[]",
    }),
  ).toEqual([-3n, 4n, 5n]);
});

test("length and word consumers normalize literal and fixed arrays", async () => {
  expect(await execute('@len!(["a" "b"])', { type: "uint256" })).toBe(2n);
  expect(await execute("@len!([])", { type: "uint256" })).toBe(0n);
  expect(await execute("@sum!([1 -2 3])", { type: "int256" })).toBe(2n);
  expect(
    await execute("@values!(@enumerate!([1 -2]))", { type: "int256[]" }),
  ).toEqual([1n, -2n]);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "int256[2]" }], [[-3n, 4n]]),
  );
  const fixed = `${source}::{items()(int256[2])}`;
  expect(await execute(`@len!(${fixed})`, { type: "uint256" })).toBe(2n);
  expect(
    await execute(`@values!(@enumerate!(${fixed}))`, { type: "int256[]" }),
  ).toEqual([-3n, 4n]);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "string[2]" }],
      [99n, ["a", "b"]],
    ),
  );
  expect(
    await execute(`@len!(${source}::{items()(uint256,string[2])}[_ $])`, {
      type: "uint256",
    }),
  ).toBe(2n);
});

test("reverse agrees off-chain and on-chain for a fixed-array return lens with either hop", async () => {
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "int256[2]" }],
      [99n, [-3n, 4n]],
    ),
  );
  const preamble = `set $target ${source}`;
  const offchain = (await runExpression(
    "@reverse($target::{items()(uint256,int256[2])}[_ $])",
    { module: "lang [@reverse]", preamble },
  )) as Num[];
  const values = offchain.map((value) => value.toBigInt());
  expect(values).toEqual([4n, -3n]);
  for (const hop of ["::", "::!"]) {
    expect(
      await execute(
        `@reverse!($target${hop}{items()(uint256,int256[2])}[_ $])`,
        { type: "int256[]" },
        preamble,
      ),
    ).toEqual(values);
  }
});

test("collection lenses accept fixed arrays and arrays of dynamic elements", async () => {
  for (const type of ["string[3]", "string[]"]) {
    await installConstantMock(
      client,
      source,
      encodeAbiParameters(
        [{ type: "uint256" }, { type }],
        [99n, ["a", "b", "a"]],
      ),
    );
    expect(
      await execute(`@unique!(${source}::{items()(uint256,${type})}[_ $])`, {
        type: "string[]",
      }),
    ).toEqual(["a", "b"]);
  }
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "int256[2]" }],
      [99n, [-3n, 4n]],
    ),
  );
  const pair = `${source}::{items()(uint256,int256[2])}[_ $]`;
  expect(await execute(`@reverse!(${pair})`, { type: "int256[]" })).toEqual([
    4n,
    -3n,
  ]);
  expect(await execute(`@len!(${pair})`, { type: "uint256" })).toBe(2n);
  expect(
    await execute(
      `@map!(${pair} @twice!)`,
      { type: "int256[]" },
      'def @twice! "$x: number -> number" @calc!($x * 2)',
    ),
  ).toEqual([-6n, 8n]);
});
