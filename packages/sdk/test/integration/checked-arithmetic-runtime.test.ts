import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Interpreter } from "@evmcrispr/core";
import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  ASSERTIONS_RUNTIME_BYTECODE,
  OPERATIONS_RUNTIME_BYTECODE,
} from "@evmcrispr/test-utils/onchain";
import {
  createPublicClient,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  http,
  parseAbiParameters,
} from "viem";
import { foundry } from "viem/chains";
import {
  evaluateCheckedExpression,
  INT256_MAX,
  INT256_MIN,
  Num,
  UINT256_MAX,
} from "../../src";
import {
  type CompileCtx,
  compileCheckedExpr,
  encodeResolve,
  operandNode,
  rawParam,
  toWord,
} from "../../src/onchain";
import { type Node, NodeType } from "../../src/types";

// An isolated, unforked EVM makes these differential tests independent of RPCs.
const port = 20000 + Math.floor(Math.random() * 20000);
const client = createPublicClient({
  chain: foundry,
  transport: http(`http://127.0.0.1:${port}`, { retryCount: 0 }),
});
registerAllModules();
let process: ReturnType<typeof Bun.spawn>;
const ctx = {
  core: "0x0000000000000000000000000000000000001001",
  operators: "0x0000000000000000000000000000000000001002",
} as unknown as CompileCtx;
beforeAll(async () => {
  process = Bun.spawn(["anvil", "--port", String(port), "--silent"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await client.getBlockNumber();
      break;
    } catch {
      await Bun.sleep(20);
    }
  }
  await client.request({
    method: "anvil_setCode" as any,
    params: [ctx.core, ASSERTIONS_RUNTIME_BYTECODE] as any,
  });
  await client.request({
    method: "anvil_setCode" as any,
    params: [ctx.operators, OPERATIONS_RUNTIME_BYTECODE] as any,
  });
});
afterAll(() => process?.kill());
const op = (value: string): Node =>
  ({ type: NodeType.Bareword, value }) as Node;
const live = (value: bigint, signed = value < 0n): Node =>
  operandNode({
    kind: "call",
    cat: signed ? "Int" : "Uint",
    param: rawParam(toWord(value)),
  });
async function resolve(
  nodes: Node[],
  mode: "trunc" | "floor" | "ceil" = "trunc",
): Promise<bigint> {
  const operand = await compileCheckedExpr(ctx, nodes, mode);
  if (operand.kind !== "call") throw new Error("Expected a live expression");
  const response = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters(
    [{ type: operand.cat === "Int" ? "int256" : "uint256" }],
    response.data as Hex,
  )[0] as bigint;
}
describe("checked arithmetic real-EVM parity", () => {
  it("matches rounded full-width quotients for mixed signs", async () => {
    for (const a of [7n, -7n, INT256_MIN, UINT256_MAX]) {
      for (const d of [3n, -3n]) {
        for (const mode of ["floor", "ceil"] as const) {
          const tokens = [Num(a), "*", Num(2n), "/", Num(d)];
          let expected: bigint;
          try {
            expected = evaluateCheckedExpression(tokens, mode).toBigInt();
          } catch {
            await expect(
              resolve([live(a), op("*"), live(2n), op("/"), live(d)], mode),
            ).rejects.toThrow();
            continue;
          }
          expect(
            await resolve([live(a), op("*"), live(2n), op("/"), live(d)], mode),
          ).toBe(expected);
        }
      }
    }
  });
  it("checks ordinary multiplication before division and guards mixed signed promotion", async () => {
    await expect(
      resolve([live(UINT256_MAX), op("*"), live(2n), op("//"), live(2n)]),
    ).rejects.toThrow();
    expect(
      await resolve(
        [live(UINT256_MAX), op("*"), live(2n), op("/"), live(2n)],
        "floor",
      ),
    ).toBe(UINT256_MAX);
    await expect(
      resolve([live(UINT256_MAX), op("+"), live(-1n)]),
    ).rejects.toThrow();
    await expect(
      resolve([live(INT256_MAX, true), op("+"), live(1n)]),
    ).rejects.toThrow();
  });
  it("matches signed division, remainder, XOR, and exponentiation", async () => {
    for (const [a, operation, b] of [
      [-7n, "//", 3n],
      [-7n, "%", 3n],
      [-1n, "xor", 3n],
      [-2n, "^", 255n],
      [INT256_MIN, "%", -1n],
    ] as const) {
      expect(await resolve([live(a), op(operation), live(b)])).toBe(
        evaluateCheckedExpression([Num(a), operation, Num(b)]).toBigInt(),
      );
    }
    await expect(resolve([live(2n), op("^"), live(-1n)])).rejects.toThrow();
    await expect(
      resolve([live(INT256_MIN), op("//"), live(-1n)]),
    ).rejects.toThrow();
    await expect(resolve([live(1n), op("//"), live(0n)])).rejects.toThrow();
  });
});

describe("signed ABI provenance through the interpreter", () => {
  it("checks positive signed results from get, arrays and tuple selection as int256", async () => {
    const target = "0x0000000000000000000000000000000000001003";
    for (const [type, value, select] of [
      ["int256", INT256_MAX, "$raw"],
      ["int256[]", [INT256_MAX], "@lang:at($raw 0)"],
      ["(uint256,int256)", [1n, INT256_MAX], "@lang:at($raw 1)"],
    ] as const) {
      const encoded = encodeAbiParameters(parseAbiParameters(type), [
        value,
      ] as any);
      const length = ((encoded.length - 2) / 2).toString(16).padStart(4, "0");
      const runtime = `0x61${length}600e60003961${length}6000f3${encoded.slice(2)}`;
      await client.request({
        method: "anvil_setCode" as any,
        params: [target, runtime] as any,
      });
      const interpreter = new Interpreter(evml.registry, {
        chainId: 31337,
        transports: { 31337: http(`http://127.0.0.1:${port}`) },
      });
      await expect(
        interpreter.interpret(`load lang
set $raw @get(${target} "value()(${type})")
set $result @calc(${select} + 1)`),
      ).rejects.toThrow("overflow");
    }
  });
});
