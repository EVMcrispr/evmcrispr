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
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  parseAbi,
} from "viem";

const client = getPublicClient();
const source = "0x00000000000000000000000000000000000e0800";
const consumer = "0x00000000000000000000000000000000000e0801";
beforeAll(() => installAssertionsCore(client));

test("a static tuple lens fills a whole call argument without duplicating its source", async () => {
  const tuple = {
    type: "tuple",
    components: [{ type: "uint256" }, { type: "address" }],
  } as const;
  const owner = "0x000000000000000000000000000000000000beef";
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "uint256" }, tuple], [99n, [7n, owner]]),
  );
  await installConstantMock(
    client,
    consumer,
    encodeAbiParameters([{ type: "uint256" }], [123n]),
  );
  const { operand, ctx } = await compileExpression(
    `${consumer}::{consume((uint256,address),string)(uint256) ${source}::{record()(uint256,(uint256,address))}[_ $] "tail"}`,
    { module: "lang" },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  const call = { to: ctx.core, data: encodeResolve(operand.param) };
  const { data } = await client.call(call);
  expect(decodeAbiParameters([{ type: "uint256" }], data as Hex)[0]).toBe(123n);
  type Frame = { to?: string; from?: string; input?: Hex; calls?: Frame[] };
  const trace = (await client.request({
    method: "debug_traceCall",
    params: [call, "latest", { tracer: "callTracer" }],
  } as never)) as unknown as Frame;
  const frames = (f: Frame): Frame[] => [f, ...(f.calls ?? []).flatMap(frames)];
  const all = frames(trace);
  const reads = all.filter((f) => f.to?.toLowerCase() === source);
  expect(reads).toHaveLength(1);
  expect(reads[0].from?.toLowerCase()).toBe(ctx.core.toLowerCase());
  const consumed = all.filter((f) => f.to?.toLowerCase() === consumer);
  expect(consumed).toHaveLength(1);
  expect(consumed[0].input).toBe(
    encodeFunctionData({
      abi: parseAbi([
        "function consume((uint256,address),string) returns (uint256)",
      ]),
      functionName: "consume",
      args: [[7n, owner], "tail"],
    }),
  );
});

test("a fixed-array lens inside a dynamic array retains its signed element type", async () => {
  await installConstantMock(
    client,
    source,
    encodeAbiParameters(
      [{ type: "int256[2][]" }],
      [
        [
          [1n, 2n],
          [-3n, 4n],
        ],
      ],
    ),
  );
  const row = `${source}::{rows()(int256[2][])}[[... $]]`;
  const { operand, ctx } = await compileExpression(`@sum!(@reverse!(${row}))`, {
    module: "lang",
  });
  if (operand.kind !== "call") throw new Error("expected call");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  expect(decodeAbiParameters([{ type: "int256" }], data as Hex)[0]).toBe(1n);
});

test("a truncated fixed-array lens reverts before producing a collection", async () => {
  await installConstantMock(
    client,
    source,
    encodeAbiParameters([{ type: "uint256" }, { type: "int256" }], [99n, -3n]),
  );
  const { operand, ctx } = await compileExpression(
    `@reverse!(${source}::{items()(uint256,int256[2])}[_ $])`,
    { module: "lang" },
  );
  if (operand.kind !== "call") throw new Error("expected call");
  await expect(
    client.call({ to: ctx.core, data: encodeResolve(operand.param) }),
  ).rejects.toThrow();
});

test("whole arrays cannot silently enter the scalar assertion path", async () => {
  for (const type of ["int256[2]", "uint256[]", "(uint256,address)"]) {
    await expect(
      compileExpression(`${source}::{items()(uint256,${type})}[_ $]`, {
        module: "lang",
      }),
    ).rejects.toThrow("unsupported return type");
  }
});
