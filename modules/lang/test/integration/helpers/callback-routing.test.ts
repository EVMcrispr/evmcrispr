import "../../setup";
import { beforeAll, expect, test } from "bun:test";
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

const source = "0x00000000000000000000000000000000000d0400";
const client = getPublicClient();
beforeAll(async () => {
  await installAssertionsCore(client);
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "uint256[]" }], [[1n, 2n, 3n]]),
  );
});
const array = `${source}::{values()(uint256[])}`;
async function execute(
  expression: string,
  output: AbiParameter,
  preamble: string,
) {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
    preamble,
  });
  if (operand.kind !== "call") throw new Error("expected live operand");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  // Word optimized arrays expose a words payload; preserve typed comparison here.
  if (operand.collection?.transport === "words") {
    const [bytes] = decodeAbiParameters([{ type: "bytes" }], data as Hex);
    const words = Array.from(
      { length: (bytes.length - 2) / 64 },
      (_, i) => `0x${bytes.slice(2 + i * 64, 2 + (i + 1) * 64)}` as Hex,
    );
    const element = {
      ...output,
      type: output.type.slice(0, -2),
    } as AbiParameter;
    return words.map((word) => decodeAbiParameters([element], word)[0]);
  }
  return decodeAbiParameters([output], data as Hex)[0];
}
test("word input maps to strings through a composed helper", async () => {
  expect(
    await execute(
      `@map!(${array} @text!)`,
      { type: "string[]" },
      `def @text! "$x: number -> string" @num.format!($x 0)`,
    ),
  ).toEqual(["1", "2", "3"]);
});
test("word map accepts constant numeric and boolean results", async () => {
  expect(
    await execute(
      `@map!(${array} @constant!)`,
      { type: "uint256[]" },
      `def @constant! "$x: number -> number" 7`,
    ),
  ).toEqual([7n, 7n, 7n]);
  expect(
    await execute(
      `@map!(${array} @truth!)`,
      { type: "bool[]" },
      `def @truth! "$x: number -> bool" true`,
    ),
  ).toEqual([true, true, true]);
});
test("word filter accepts constant predicates and rejects numeric predicates", async () => {
  expect(
    await execute(
      `@filter!(${array} @yes!)`,
      { type: "uint256[]" },
      `def @yes! "$x: number -> bool" true`,
    ),
  ).toEqual([1n, 2n, 3n]);
  expect(
    await execute(
      `@filter!(${array} @no!)`,
      { type: "uint256[]" },
      `def @no! "$x: number -> bool" false`,
    ),
  ).toEqual([]);
  await expect(
    compileExpression(`@filter!(${array} @wrong!)`, {
      module: "lang",
      preamble: `def @wrong! "$x: number -> number" @calc!($x + 1)`,
    }),
  ).rejects.toThrow("must return bool");
});
test("reducers accept constants, omitted element references and live initial values", async () => {
  expect(
    await execute(
      `@reduce!(${array} @constant! 1)`,
      { type: "uint256" },
      `def @constant! "$a: number $x: number -> number" 7`,
    ),
  ).toBe(7n);
  expect(
    await execute(
      `@reduce!(${array} @increment! 1)`,
      { type: "uint256" },
      `def @increment! "$a: number $x: number -> number" @calc!($a + 1)`,
    ),
  ).toBe(4n);
  expect(
    await execute(
      `@reduce!(${array} @add! ${OPERATIONS_ADDRESS}::{add(uint256,uint256)(uint256) 2 3})`,
      { type: "uint256" },
      `def @add! "$a: number $x: number -> number" @calc!($a + $x)`,
    ),
  ).toBe(11n);
});
test("word input can fold a string accumulator", async () => {
  expect(
    await execute(
      `@reduce!(${array} @append! "")`,
      { type: "string" },
      `def @append! "$a: string $x: number -> string" @str.concat!($a @num.format!($x 0))`,
    ),
  ).toBe("123");
});
test("eligible checked arithmetic still uses the word template", async () => {
  const { operand } = await compileExpression(`@map!(${array} @twice!)`, {
    module: "lang",
    preamble: `def @twice! "$x: number -> number" @calc!($x * 2)`,
  });
  expect(operand.kind === "call" && operand.collection?.transport).toBe(
    "words",
  );
  expect(
    await execute(
      `@map!(${array} @twice!)`,
      { type: "uint256[]" },
      `def @twice! "$x: number -> number" @calc!($x * 2)`,
    ),
  ).toEqual([2n, 4n, 6n]);
});
test("narrow callback results retain ABI range validation", async () => {
  await expect(
    execute(
      `@map!(${array} @narrow!)`,
      { type: "uint8[]" },
      `def @narrow! "$x: number -> uint8" @calc!($x + 255)`,
    ),
  ).rejects.toThrow();
});

test("numeric reducer literals retain signed array arithmetic", async () => {
  const signedSource = "0x00000000000000000000000000000000000d0401";
  await installConstantMock(
    client,
    signedSource,
    encodeAbiParameters([{ type: "int256[]" }], [[-1n, 2n]]),
  );
  expect(
    await execute(
      `@reduce!(${signedSource}::{values()(int256[])} @add! 0)`,
      { type: "int256" },
      `def @add! "$a: number $x: number -> number" @calc!($a + $x)`,
    ),
  ).toBe(1n);
});
test("word arrays can reduce to a constant boolean accumulator", async () => {
  expect(
    await execute(
      `@reduce!(${array} @yes! false)`,
      { type: "bool" },
      `def @yes! "$a: bool $x: number -> bool" true`,
    ),
  ).toBe(true);
});
