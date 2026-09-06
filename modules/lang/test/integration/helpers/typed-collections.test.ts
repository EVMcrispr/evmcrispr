import { parseScript } from "@evmcrispr/core";
import { BindingsSpace } from "@evmcrispr/sdk";
import "../../setup";
import { beforeAll, describe, expect, test } from "bun:test";
import { encodeResolve, OPERATIONS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";

const SOURCE = "0x00000000000000000000000000000000000c011e";
const client = getPublicClient();
beforeAll(async () => {
  await installAssertionsCore(client);
});
async function resolve(
  expression: string,
  type: string,
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
  return decodeAbiParameters([{ type } as never], data as Hex)[0];
}
describe("typed collection execution", () => {
  test("split returns strings; nested at and len preserve values", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "string" }], ["a::bb::"]),
    );
    const split = `@str.split!(${SOURCE}::{value()(string)} "::")`;
    expect(await resolve(split, "string[]")).toEqual(["a", "bb", ""]);
    expect(await resolve(`@at!(${split} 1)`, "string")).toBe("bb");
    expect(await resolve(`@len!(${split})`, "uint256")).toBe(3n);
  });
  test("stable distinct and nested signed sorting", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "int256[]" }], [[-2n, 1n, -2n, -1n]]),
    );
    const unique = `@unique!(${SOURCE}::{values()(int256[])})`;
    expect(await resolve(`@at!(${unique} 0)`, "int256")).toBe(-2n);
    expect(await resolve(`@at!(@sort!(${unique}) 1)`, "int256")).toBe(-1n);
  });
  test("generic dynamic map uses whole ABI argument slots", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "string[]" }], [["123", "456"]]),
    );
    // bytes and string have identical ABI encoding, but callbacks require exact declared types.
    const preamble = `def @length! "$x: string -> number" ${OPERATIONS_ADDRESS}::{byteLen(bytes)(uint256) $x}`;
    await expect(
      resolve(
        `@map!(${SOURCE}::{values()(string[])} @length!)`,
        "uint256[]",
        preamble,
      ),
    ).rejects.toThrow("must have ABI type string");
  });
  test("generic bytes map + live fold accumulator", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x1234", "0xabcdef"]]),
    );
    const preamble = `def @length! "$x: bytes -> number" ${OPERATIONS_ADDRESS}::{byteLen(bytes)(uint256) $x}`;
    expect(
      await resolve(
        `@map!(${SOURCE}::{values()(bytes[])} @length!)`,
        "uint256[]",
        preamble,
      ),
    ).toEqual([2n, 3n]);
  });
  test("runtime nested strings flatten one level", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters(
        [{ type: "string[][]" }],
        [[["a", "bb"], [], ["ccc"]]],
      ),
    );
    expect(
      await resolve(`@flat!(${SOURCE}::{values()(string[][])})`, "string[]"),
    ).toEqual(["a", "bb", "ccc"]);
  });
  test("generic filter with a constant callback capture", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x61", "0x62", "0x6161"]]),
    );
    const mask = 1n << 97n;
    const preamble = `def @onlyA! "$x: bytes -> bool" ${OPERATIONS_ADDRESS}::{charset(bytes,uint256)(bool) $x ${mask}}`;
    expect(
      await resolve(
        `@filter!(${SOURCE}::{values()(bytes[])} @onlyA!)`,
        "bytes[]",
        preamble,
      ),
    ).toEqual(["0x61", "0x6161"]);
  });
  test("direct signed comparator and live initial reduction", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "int256[]" }], [[3n, -2n, 1n]]),
    );
    const defs = `def @cmp! "$a: number $b: number -> number" ${OPERATIONS_ADDRESS}::{sub(int256,int256)(int256) $a $b}
  def @sum! "$a: number $b: number -> number" ${OPERATIONS_ADDRESS}::{add(int256,int256)(int256) $a $b}`;
    expect(
      await resolve(
        `@sort!(${SOURCE}::{values()(int256[])} @cmp!)`,
        "int256[]",
        defs,
      ),
    ).toEqual([-2n, 1n, 3n]);
    expect(
      await resolve(
        `@reduce!(${SOURCE}::{values()(int256[])} @sum! @at!(${SOURCE}::{values()(int256[])} 0))`,
        "int256",
        defs,
      ),
    ).toBe(5n);
  });

  test("generic callback captures a live value before traversal", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x61", "0x62"]]),
    );
    const maskAddress = "0x00000000000000000000000000000000000c011f";
    await installConstantMock(
      client,
      maskAddress,
      encodeAbiParameters([{ type: "uint256" }], [1n << 97n]),
    );
    const preamble = `def @allowed! "$x: bytes -> bool" ${OPERATIONS_ADDRESS}::{charset(bytes,uint256)(bool) $x ${maskAddress}::{mask()(uint256)}}`;
    expect(
      await resolve(
        `@filter!(${SOURCE}::{values()(bytes[])} @allowed!)`,
        "bytes[]",
        preamble,
      ),
    ).toEqual(["0x61"]);
  });
  test("concatenates dynamic arrays and constants", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "string[]" }], [["a", "bb"]]),
    );
    expect(
      await resolve(
        `@concat!(${SOURCE}::{values()(string[])} ["c"])`,
        "string[]",
      ),
    ).toEqual(["a", "bb", "c"]);
  });
  test("typed tuple annotations and selected tuple values", async () => {
    const target = "0x00000000000000000000000000000000000c0120";
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [{ type: "int256" }, { type: "string" }],
          },
        ],
        [
          [
            [-2n, "a"],
            [3n, "b"],
          ],
        ],
      ),
    );
    await installConstantMock(
      client,
      target,
      encodeAbiParameters([{ type: "int256" }], [-1n]),
    );
    const preamble = `def @project! "$x: (int256,string) -> int256" ${target}::{project((int256,string))(int256) $x}`;
    expect(
      await resolve(
        `@map!(${SOURCE}::{values()((int256,string)[])} @project!)`,
        "int256[]",
        preamble,
      ),
    ).toEqual([-1n, -1n]);
  });
  test("zip retains signed lane metadata and counts pairs", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "int256[]" }], [[-2n, 3n]]),
    );
    const zipped = `@zip!(${SOURCE}::{values()(int256[])} [10 20])`;
    expect(await resolve(`@len!(${zipped})`, "uint256")).toBe(2n);
    expect(await resolve(`@at!(@keys!(${zipped}) 0)`, "int256")).toBe(-2n);
  });
  test("runtime join supports constant and live delimiters", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "string[]" }], [["a", "bc"]]),
    );
    expect(
      await resolve(`@str.join!(${SOURCE}::{values()(string[])} "")`, "string"),
    ).toBe("abc");
    expect(
      await resolve(
        `@str.join!(${SOURCE}::{values()(string[])} ",")`,
        "string",
      ),
    ).toBe("a,bc");
    const delimiter = "0x00000000000000000000000000000000000c011f";
    await installConstantMock(
      client,
      delimiter,
      encodeAbiParameters([{ type: "string" }], ["::"]),
    );
    const live = `${delimiter}::{delimiter()(string)}`;
    expect(
      await resolve(
        `@str.join!(${SOURCE}::{values()(string[])} ${live})`,
        "string",
      ),
    ).toBe("a::bc");
    expect(await resolve(`@str.join!(["a" "" "bc"] ${live})`, "string")).toBe(
      "a::::bc",
    );
    for (const parts of [
      [],
      [""],
      ["solo"],
      ["", "", ""],
      ["é", "🙂", "x".repeat(33)],
    ]) {
      await installConstantMock(
        client,
        SOURCE,
        encodeAbiParameters([{ type: "string[]" }], [parts]),
      );
      expect(
        await resolve(
          `@str.join!(${SOURCE}::{values()(string[])} ${live})`,
          "string",
        ),
      ).toBe(parts.join("::"));
    }
  });
  test("generic distinct obeys the supplied equivalence predicate", async () => {
    const predicate = "0x00000000000000000000000000000000000c0121";
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x61", "0x62", "0x61"]]),
    );
    await installConstantMock(
      client,
      predicate,
      encodeAbiParameters([{ type: "bool" }], [true]),
    );
    const preamble = `def @equivalent! "$a: bytes $b: bytes -> bool" ${predicate}::{equal(bytes,bytes)(bool) $a $b}`;
    expect(
      await resolve(
        `@unique!(${SOURCE}::{values()(bytes[])} @equivalent!)`,
        "bytes[]",
        preamble,
      ),
    ).toEqual(["0x61"]);
  });
  test("fold carries dynamic bytes through every callback", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "bytes[]" }], [["0x62", "0x63"]]),
    );
    const preamble = `def @replaceA! "$acc: bytes $item: bytes -> bytes" ${OPERATIONS_ADDRESS}::{replace(bytes,bytes,bytes)(bytes) $acc 0x61 $item}`;
    expect(
      await resolve(
        `@reduce!(${SOURCE}::{values()(bytes[])} @replaceA! 0x61)`,
        "bytes",
        preamble,
      ),
    ).toEqual("0x62");
  });
  test("rejects a callback whose concrete annotation conflicts with ABI", async () => {
    await installConstantMock(
      client,
      SOURCE,
      encodeAbiParameters([{ type: "int256[]" }], [[1n]]),
    );
    const preamble = `def @wrong! "$x: uint256 -> int256" ${OPERATIONS_ADDRESS}::{exp(int256,uint256)(int256) $x 1}`;
    await expect(
      resolve(
        `@map!(${SOURCE}::{values()(int256[])} @wrong!)`,
        "int256[]",
        preamble,
      ),
    ).rejects.toThrow("annotation");
  });

  test("off-chain ABI tuple definitions retain named tuple objects", async () => {
    const { evm } = await compileExpression("0", {
      preamble: 'def @identity "$x: (int256,string) -> (int256,string)" $x',
    });
    const value = { number: 3n, label: "named" };
    evm
      .getModule("std")!
      .bindingsManager.setBinding(
        "$input",
        value as never,
        BindingsSpace.USER,
        false,
        undefined,
        true,
      );
    await evm.interpretNode(
      parseScript("set $result @identity($input)").ast.body[0],
    );
    expect(evm.getBinding("$result", BindingsSpace.USER) as unknown).toEqual(
      value,
    );
  });
});
