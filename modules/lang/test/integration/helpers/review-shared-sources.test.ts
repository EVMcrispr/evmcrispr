import "../../setup";
import { beforeAll, expect, test } from "bun:test";
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
  getAddress,
  type Hex,
} from "viem";

const client = getPublicClient();
const SOURCE = "0x00000000000000000000000000000000000e0100";
const A = "0x00000000000000000000000000000000000e0101";
const B = "0x00000000000000000000000000000000000e0102";
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
  if (operand.kind !== "call") throw new Error("Expected live operand");
  const call = { to: ctx.core, data: encodeResolve(operand.param) };
  const { data } = await client.call(call);
  const trace = (await client.request({
    method: "debug_traceCall",
    params: [call, "latest", { tracer: "callTracer" }],
  } as never)) as unknown as { to?: string; calls?: unknown[] };
  function callsToSource(frame: typeof trace): number {
    return (
      Number(frame.to?.toLowerCase() === SOURCE.toLowerCase()) +
      (frame.calls ?? []).reduce<number>(
        (sum, child) => sum + callsToSource(child as typeof trace),
        0,
      )
    );
  }
  expect(callsToSource(trace)).toBe(1);
  if (
    operand.collection?.transport === "words" &&
    output.type === "address[]"
  ) {
    const words = decodeAbiParameters(
      [{ type: "bytes" }],
      data as Hex,
    )[0].slice(2);
    return (words.match(/.{64}/g) ?? []).map(
      (word) => decodeAbiParameters([{ type: "address" }], `0x${word}`)[0],
    );
  }
  return decodeAbiParameters([output], data as Hex)[0];
}
test("find resolves its source once for search and extraction", async () => {
  await installConstantMock(
    client,
    SOURCE,
    encodeAbiParameters([{ type: "uint256[]" }], [[1n, 2n, 3n]]),
  );
  expect(
    await execute(
      `@find!(${SOURCE}::{items()(uint256[])} @matches!)`,
      { type: "uint256" },
      `def @matches! "$x: uint256 -> bool" @bool!($x == 2)`,
    ),
  ).toBe(2n);
});
test("unzip resolves its source once for both typed lanes", async () => {
  const pair = {
    type: "tuple[]",
    components: [{ type: "uint256" }, { type: "string" }],
  } as const;
  await installConstantMock(
    client,
    SOURCE,
    encodeAbiParameters(
      [pair],
      [
        [
          [1n, "a"],
          [2n, "bb"],
        ],
      ],
    ),
  );
  expect(
    await execute(`@unzip!(${SOURCE}::{items()((uint256,string)[])})`, {
      type: "tuple",
      components: [{ type: "uint256[]" }, { type: "string[]" }],
    }),
  ).toEqual([
    [1n, 2n],
    ["a", "bb"],
  ]);
});
test("a callback parameter can supply both target and argument", async () => {
  await installConstantMock(
    client,
    SOURCE,
    encodeAbiParameters([{ type: "address[]" }], [[A, B]]),
  );
  for (const target of [A, B] as const)
    await installConstantMock(
      client,
      target,
      encodeAbiParameters([{ type: "address" }], [target]),
    );
  expect(
    await execute(
      `@map!(${SOURCE}::{items()(address[])} @identity!)`,
      { type: "address[]" },
      `def @identity! "$x: address -> address" $x::{echo(address)(address) $x}`,
    ),
  ).toEqual([getAddress(A), getAddress(B)]);
});
