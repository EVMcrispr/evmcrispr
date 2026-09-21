import "../../setup";
import { beforeAll, expect, test } from "bun:test";
import {
  arrayLengthParam,
  COLLECTIONS_ADDRESS,
  encodeResolve,
  typedArrayFromOperand,
} from "@evmcrispr/sdk/onchain";
import { getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  toFunctionSelector,
} from "viem";

const client = getPublicClient();
const source = "0x00000000000000000000000000000000000e0600";
beforeAll(() => installAssertionsCore(client));

test("generic pipelines preserve ABI results and measure encoding overhead", async () => {
  for (const count of [2, 4]) {
    const values = Array.from(
      { length: count },
      (_, i) => `${i}:${"x".repeat(33)}`,
    );
    await installConstantMock(
      client,
      source,
      encodeAbiParameters([{ type: "string[]" }], [values]),
    );
    const { operand, ctx } = await compileExpression(
      `@reverse!(@filter!(@map!(${source}::{items()(string[])} @duplicate!) @keep!))`,
      {
        module: "lang",
        preamble: `def @duplicate! "$x: string -> string" @str.concat!($x $x)
def @keep! "$x: string -> bool" @bool!(@str.len!($x) > 0)`,
      },
    );
    if (operand.kind !== "call") throw new Error("expected call");
    expect(operand.collection?.transport).toBe("abi");
    const call = { to: ctx.core, data: encodeResolve(operand.param) };
    const { data } = await client.call(call);
    expect(decodeAbiParameters([{ type: "string[]" }], data as Hex)[0]).toEqual(
      values.map((v) => v + v).reverse(),
    );
    type Frame = { to?: string; input?: Hex; calls?: Frame[] };
    const trace = (await client.request({
      method: "debug_traceCall",
      params: [call, "latest", { tracer: "callTracer" }],
    } as never)) as unknown as Frame;
    const frames = (f: Frame): Frame[] => [
      f,
      ...(f.calls ?? []).flatMap(frames),
    ];
    const all = frames(trace);
    const calls = (signature: string) =>
      all.filter(
        (f) =>
          f.to?.toLowerCase() === COLLECTIONS_ADDRESS.toLowerCase() &&
          f.input?.startsWith(toFunctionSelector(signature)),
      ).length;
    expect(all.filter((f) => f.to?.toLowerCase() === source).length).toBe(1);
    const gas = await client.estimateGas(call);
    expect(calls("packArray(string,bytes[])")).toBe(1);
    expect(calls("unpackArray(string,bytes)")).toBe(1);
    // A scalar consumer can count the validated values without any final pack.
    const lengthCall = {
      to: ctx.core,
      data: encodeResolve(
        arrayLengthParam(ctx, typedArrayFromOperand(ctx, operand, "len!")),
      ),
    };
    const length = await client.call(lengthCall);
    expect(
      decodeAbiParameters([{ type: "uint256" }], length.data as Hex)[0],
    ).toBe(BigInt(count));
    const lengthTrace = (await client.request({
      method: "debug_traceCall",
      params: [lengthCall, "latest", { tracer: "callTracer" }],
    } as never)) as unknown as Frame;
    expect(
      frames(lengthTrace).filter(
        (f) =>
          f.to?.toLowerCase() === COLLECTIONS_ADDRESS.toLowerCase() &&
          f.input?.startsWith(toFunctionSelector("packArray(string,bytes[])")),
      ),
    ).toHaveLength(0);
    console.log(
      `collection-pipeline n=${count} gas=${gas} calldata=${(call.data.length - 2) / 2} pack=${calls("packArray(string,bytes[])")} unpack=${calls("unpackArray(string,bytes)")}`,
    );
  }
}, 30_000);
