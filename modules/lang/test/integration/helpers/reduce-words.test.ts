import "../../setup";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  COLLECTIONS_ADDRESS,
  CORE_ABI,
  type InputParam,
  OP_SELECTORS,
  OPERATIONS_ADDRESS,
  opSelector,
  REDUCE,
  REDUCE_CMP,
} from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  describeParity,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  type Hex,
  type PublicClient,
  toFunctionSelector,
} from "viem";
import { helpers } from "../../../src/_generated";

/**
 * Predicates of the form `call(element) <cmp> bound`, and sums of a mapped
 * array: the shapes that reduce in the loop that calls the lambda.
 *
 * The parity cases compare values, on a real EVM. The routing tests below
 * them pin WHICH engine a shape compiles to, since a silent fall back to
 * the slower path would still return the right value.
 */

const TOKEN = "0x00000000000000000000000000000000000e0001";
const HOLDERS_SRC = "0x00000000000000000000000000000000000e0002";
const VALUES_SRC = "0x00000000000000000000000000000000000e0003";
const SIGNED_SRC = "0x00000000000000000000000000000000000e0004";
const EMPTY_SRC = "0x00000000000000000000000000000000000e0005";

/**
 * A token whose every function returns 1000 when its first argument is
 * nonzero and 0 otherwise, so `balanceOf` depends on the holder and
 * `getValue()` is 0:
 *
 *   PUSH1 4 CALLDATALOAD ISZERO ISZERO PUSH2 1000 MUL
 *   PUSH1 0 MSTORE PUSH1 32 PUSH1 0 RETURN
 */
const TOKEN_CODE = "0x60043515156103e80260005260206000f3";

const HOLDER_LIST = [
  "0x00000000000000000000000000000000000000a1",
  "0x0000000000000000000000000000000000000000",
  "0x00000000000000000000000000000000000000a2",
  "0x00000000000000000000000000000000000000a3",
] as const;
const VALUES = [3n, 1n, 4n, 1n, 5n, 9n, 2n, 6n];
const SIGNED = [-3n, 2n, -1n, 7n];

const HOLDERS = `${HOLDERS_SRC}::{values()(address[])}`;
const ARR = `${VALUES_SRC}::{values()(uint256[])}`;
const INTS = `${SIGNED_SRC}::{values()(int256[])}`;
const EMPTY = `${EMPTY_SRC}::{values()(address[])}`;

const PREAMBLE = [
  // Off-chain predicates.
  `def @rich "$x: address -> bool" @bool(${TOKEN}::{balanceOf(address)(uint256) $x} >= 1000)`,
  `def @funded "$x: address -> bool" @bool(${TOKEN}::{balanceOf(address)(uint256) $x} != 0)`,
  `def @aboveStored "$x: address -> bool" @bool(${TOKEN}::{balanceOf(address)(uint256) $x} > ${TOKEN}::{getValue()(uint256)})`,
  `def @bal "$x: address -> number" ${TOKEN}::{balanceOf(address)(uint256) $x}`,
  'def @dbl "$x: number -> number" @num($x * 2)',
  'def @dblBig "$x: number -> bool" @bool(@num($x * 2) >= 8)',
  'def @dblLow "$x: number -> bool" @bool(@num($x * 2) < -1)',
  'def @big "$x: number -> bool" @bool($x > 3)',
  'def @nonZero "$x: number -> bool" @bool(@num($x * 2) > 0)',
  // On-chain predicates, written independently of the ones above.
  `def @rich! "$x: address -> bool" @bool!(${TOKEN}::!{balanceOf(address)(uint256) $x} >= 1000)`,
  `def @richMirrored! "$x: address -> bool" @bool!(1000 <= ${TOKEN}::!{balanceOf(address)(uint256) $x})`,
  `def @funded! "$x: address -> bool" @bool!(${TOKEN}::!{balanceOf(address)(uint256) $x} != 0)`,
  `def @aboveStored! "$x: address -> bool" @bool!(${TOKEN}::!{balanceOf(address)(uint256) $x} > ${TOKEN}::!{getValue()(uint256)})`,
  `def @bal! "$x: address -> uint256" ${TOKEN}::!{balanceOf(address)(uint256) $x}`,
  'def @dbl! "$x: number -> number" @calc!($x * 2)',
  'def @dblBig! "$x: number -> bool" @bool!(@calc!($x * 2) >= 8)',
  'def @dblLow! "$x: int256 -> bool" @bool!(@calc!($x * 2) < -1)',
  'def @dblInt! "$x: int256 -> int256" @calc!($x * 2)',
  'def @big! "$x: number -> bool" @bool!($x > 3)',
  'def @nonZero! "$x: number -> bool" @bool!(@calc!($x * 2) > 0)',
].join("\n");

const source = (type: string, values: readonly unknown[]): Hex =>
  encodeAbiParameters([{ type }], [values]);

async function install(client: PublicClient) {
  await client.request({
    method: "anvil_setCode",
    params: [TOKEN, TOKEN_CODE],
  } as never);
  await installConstantMock(
    client,
    HOLDERS_SRC,
    source("address[]", HOLDER_LIST),
  );
  await installConstantMock(client, VALUES_SRC, source("uint256[]", VALUES));
  await installConstantMock(client, SIGNED_SRC, source("int256[]", SIGNED));
  await installConstantMock(client, EMPTY_SRC, source("address[]", []));
}

describeParity("@lang reductions", {
  module: "lang [@all @any @count @sum @map @filter @len]",
  helpers,
  preamble: PREAMBLE,
  setup: install,
  cases: [
    {
      name: "all is false when one holder is below the bound",
      run: `@all(${HOLDERS} @rich)`,
      compile: `@all!(${HOLDERS} @rich!)`,
    },
    {
      name: "all is true when every holder passes",
      run: `@all(${ARR} @nonZero)`,
      compile: `@all!(${ARR} @nonZero!)`,
    },
    {
      name: "any finds a holder at the bound",
      run: `@any(${HOLDERS} @rich)`,
      compile: `@any!(${HOLDERS} @rich!)`,
    },
    {
      name: "count counts the holders at the bound",
      run: `@count(${HOLDERS} @rich)`,
      compile: `@count!(${HOLDERS} @rich!)`,
    },
    {
      // The element on the right-hand side: 1000 <= f(x) is f(x) >= 1000.
      name: "count with the call on the right-hand side",
      run: `@count(${HOLDERS} @rich)`,
      compile: `@count!(${HOLDERS} @richMirrored!)`,
    },
    {
      name: "count with an inequality",
      run: `@count(${HOLDERS} @funded)`,
      compile: `@count!(${HOLDERS} @funded!)`,
    },
    {
      // The bound is itself a call, resolved once for the whole reduction.
      name: "count against a live bound",
      run: `@count(${HOLDERS} @aboveStored)`,
      compile: `@count!(${HOLDERS} @aboveStored!)`,
    },
    {
      name: "all over an arithmetic result",
      run: `@all(${ARR} @dblBig)`,
      compile: `@all!(${ARR} @dblBig!)`,
    },
    {
      name: "count over an arithmetic result",
      run: `@count(${ARR} @dblBig)`,
      compile: `@count!(${ARR} @dblBig!)`,
    },
    {
      // Negative results below a negative bound: an unsigned comparison
      // would count none of them.
      name: "count over signed results",
      run: `@count(${INTS} @dblLow)`,
      compile: `@count!(${INTS} @dblLow!)`,
    },
    {
      name: "any over signed results",
      run: `@any(${INTS} @dblLow)`,
      compile: `@any!(${INTS} @dblLow!)`,
    },
    {
      name: "all is true over an empty array",
      run: `@all(${EMPTY} @rich)`,
      compile: `@all!(${EMPTY} @rich!)`,
    },
    {
      name: "any is false over an empty array",
      run: `@any(${EMPTY} @rich)`,
      compile: `@any!(${EMPTY} @rich!)`,
    },
    {
      name: "count is zero over an empty array",
      run: `@count(${EMPTY} @rich)`,
      compile: `@count!(${EMPTY} @rich!)`,
    },
    {
      // No call to lift: the predicate is one comparison of the element.
      name: "count with a predicate over the bare element",
      run: `@count(${ARR} @big)`,
      compile: `@count!(${ARR} @big!)`,
    },
    {
      name: "sum of a mapped array",
      run: `@sum(@map(${ARR} @dbl))`,
      compile: `@sum!(@map!(${ARR} @dbl!))`,
    },
    {
      name: "sum of the balances of every holder",
      run: `@sum(@map(${HOLDERS} @bal))`,
      compile: `@sum!(@map!(${HOLDERS} @bal!))`,
    },
    {
      // A comparison over a call is one lambda for the word filter, which
      // itself refuses a result that is not a canonical bool.
      name: "filter keeps the holders at the bound",
      run: `@filter(${HOLDERS} @rich)`,
      compile: `@filter!(${HOLDERS} @rich!)`,
      decodeAs: "address[]",
    },
    {
      name: "filter against a live bound",
      run: `@filter(${HOLDERS} @aboveStored)`,
      compile: `@filter!(${HOLDERS} @aboveStored!)`,
      decodeAs: "address[]",
    },
    {
      name: "the length of a filtered array",
      run: `@len(@filter(${HOLDERS} @rich))`,
      compile: `@len!(@filter!(${HOLDERS} @rich!))`,
    },
    {
      name: "filter over an empty array",
      run: `@filter(${EMPTY} @rich)`,
      compile: `@filter!(${EMPTY} @rich!)`,
      decodeAs: "address[]",
    },
    {
      name: "map reads the balance of every holder",
      run: `@map(${HOLDERS} @bal)`,
      compile: `@map!(${HOLDERS} @bal!)`,
      decodeAs: "uint256[]",
    },
    {
      // Signed results keep the signed fold: -6 + 4 - 2 + 14.
      name: "sum of a signed mapped array",
      run: `@sum(@map(${INTS} @dbl))`,
      compile: `@sum!(@map!(${INTS} @dblInt!))`,
    },
  ],
});

/** The literal calldata of a compiled Collections call: its selector, and
 *  the bytes the compiler laid out before the live payload. */
async function collectionCall(expression: string) {
  const { operand, ctx } = await compileExpression(expression, {
    module: "lang",
    preamble: PREAMBLE,
  });
  if (operand.kind !== "call") throw new Error("expected a live operand");
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    operand.param.paramData,
  ) as [Hex, Hex];
  expect(getAddress(target)).toBe(getAddress(ctx.core));
  const { functionName, args } = decodeFunctionData({ abi: CORE_ABI, data });
  expect(functionName).toBe("read");
  const [host, selector, segments] = args as unknown as [
    InputParam,
    Hex,
    readonly InputParam[],
  ];
  const literal = segments[0].paramData.slice(2);
  const word = (i: number): bigint =>
    BigInt(`0x${literal.slice(i * 64, (i + 1) * 64)}`);
  return { host, selector, segments, literal, word, core: ctx.core };
}

/** The lambda template of a compiled `reduceWords`, read through the
 *  offset its own head declares. */
function templateOf(call: Awaited<ReturnType<typeof collectionCall>>): Hex {
  const at = Number(call.word(2)) * 2;
  const length = Number(BigInt(`0x${call.literal.slice(at, at + 64)}`));
  return `0x${call.literal.slice(at + 64, at + 64 + length * 2)}`;
}

describe("@lang reductions > routing", () => {
  const client = getPublicClient();
  beforeAll(async () => {
    await installAssertionsCore(client);
    await install(client);
  });

  test("a call compared with a constant reduces with one direct call per element", async () => {
    const call = await collectionCall(`@all!(${HOLDERS} @rich!)`);
    expect(BigInt(call.host.paramData)).toBe(BigInt(COLLECTIONS_ADDRESS));
    expect(call.selector).toBe(OP_SELECTORS.reduceWords);
    // The lambda is the token's own balanceOf, not a read through the core.
    expect(call.word(1)).toBe(BigInt(TOKEN));
    expect(call.word(4)).toBe(BigInt(REDUCE.All));
    expect(call.word(5)).toBe(BigInt(REDUCE_CMP.GE));
    expect(call.word(6)).toBe(1000n);
    const template = templateOf(call);
    expect(template.slice(0, 10)).toBe(
      toFunctionSelector("function balanceOf(address)"),
    );
    expect(template.length).toBe(2 + 2 * 36);
  });

  test("each helper selects its own reduction", async () => {
    const any = await collectionCall(`@any!(${HOLDERS} @rich!)`);
    expect(any.selector).toBe(OP_SELECTORS.reduceWords);
    expect(any.word(4)).toBe(BigInt(REDUCE.Any));
    const count = await collectionCall(`@count!(${HOLDERS} @rich!)`);
    expect(count.selector).toBe(OP_SELECTORS.reduceWords);
    expect(count.word(4)).toBe(BigInt(REDUCE.Count));
  });

  test("the call on the right-hand side mirrors the ordering", async () => {
    const call = await collectionCall(`@count!(${HOLDERS} @richMirrored!)`);
    expect(call.selector).toBe(OP_SELECTORS.reduceWords);
    expect(call.word(5)).toBe(BigInt(REDUCE_CMP.GE));
    expect(call.word(6)).toBe(1000n);
  });

  test("an inequality keeps its own comparison", async () => {
    const call = await collectionCall(`@count!(${HOLDERS} @funded!)`);
    expect(call.word(5)).toBe(BigInt(REDUCE_CMP.NE));
    expect(call.word(6)).toBe(0n);
  });

  test("a signed comparison selects the signed ordering", async () => {
    const call = await collectionCall(`@count!(${INTS} @dblLow!)`);
    expect(call.selector).toBe(OP_SELECTORS.reduceWords);
    expect(call.word(1)).toBe(BigInt(OPERATIONS_ADDRESS));
    expect(call.word(5)).toBe(BigInt(REDUCE_CMP.SLT));
    expect(BigInt.asIntN(256, call.word(6))).toBe(-1n);
    expect(templateOf(call).slice(0, 10)).toBe(opSelector("mul", true));
  });

  test("a live bound is one operand of the reduction, outside the lambda", async () => {
    const call = await collectionCall(`@count!(${HOLDERS} @aboveStored!)`);
    expect(call.selector).toBe(OP_SELECTORS.reduceWords);
    // Six literal head words, then the bound as its own resolved operand.
    expect(call.segments[0].paramData.length).toBe(2 + 6 * 64);
    expect(call.segments[1].fetcherType).toBe(1);
    const [boundTarget, boundData] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      call.segments[1].paramData,
    ) as [Hex, Hex];
    expect(getAddress(boundTarget)).toBe(getAddress(TOKEN));
    expect(boundData).toBe(toFunctionSelector("function getValue()"));
    expect(call.word(5)).toBe(BigInt(REDUCE_CMP.GT));
  });

  test("a predicate over the bare element keeps its fold", async () => {
    const all = await collectionCall(`@all!(${ARR} @big!)`);
    expect(all.selector).toBe(OP_SELECTORS.foldWords);
    const any = await collectionCall(`@any!(${ARR} @big!)`);
    expect(any.selector).toBe(OP_SELECTORS.foldWords);
  });

  test("an unsigned sum of a map is one reduction over the source", async () => {
    const call = await collectionCall(`@sum!(@map!(${ARR} @dbl!))`);
    expect(call.selector).toBe(OP_SELECTORS.reduceWords);
    expect(call.word(1)).toBe(BigInt(OPERATIONS_ADDRESS));
    expect(call.word(4)).toBe(BigInt(REDUCE.Sum));
    expect(templateOf(call).slice(0, 10)).toBe(opSelector("mul"));
  });

  test("a signed sum of a map keeps the signed fold", async () => {
    const call = await collectionCall(`@sum!(@map!(${INTS} @dblInt!))`);
    expect(call.selector).toBe(OP_SELECTORS.foldWords);
  });

  test("a filter over a call comparison is a word filter through the core", async () => {
    const call = await collectionCall(`@filter!(${HOLDERS} @rich!)`);
    expect(call.selector).toBe(OP_SELECTORS.filterWords);
    // The comparison and the call it wraps are one read per element.
    expect(call.word(1)).toBe(BigInt(call.core));
    const { functionName } = decodeFunctionData({
      abi: CORE_ABI,
      data: templateOf(call),
    });
    expect(functionName).toBe("read");
  });

  test("a map over a call is one direct call per element", async () => {
    const call = await collectionCall(`@map!(${HOLDERS} @bal!)`);
    expect(call.selector).toBe(OP_SELECTORS.mapWords);
    expect(call.word(1)).toBe(BigInt(TOKEN));
    const template = templateOf(call);
    expect(template.slice(0, 10)).toBe(
      toFunctionSelector("function balanceOf(address)"),
    );
    expect(template.length).toBe(2 + 2 * 36);
  });

  test("a map to bools over a call keeps its validated path", async () => {
    // Nothing checks a mapped word, so a bool that did not come from
    // Operations is not taken on trust.
    const { operand } = await compileExpression(`@map!(${HOLDERS} @rich!)`, {
      module: "lang",
      preamble: PREAMBLE,
    });
    expect(operand.kind === "call" && operand.collection?.transport).toBe(
      "abi",
    );
  });

  test("a plain sum keeps the native sum", async () => {
    const call = await collectionCall(`@sum!(${ARR})`);
    expect(call.selector).toBe(OP_SELECTORS.sumWords);
  });
});
