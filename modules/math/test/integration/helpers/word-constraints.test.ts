import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  expWad,
  type HelperFunctionNode,
  INT256_MAX,
  lnWad,
  NodeType,
} from "@evmcrispr/sdk";
import {
  CORE_ABI,
  type CompileCtx,
  type Constraint,
  constraint,
  constrainWord,
  encodeCond,
  encodeResolve,
  type HelperCompile,
  type InputParam,
  inConstraint,
  operandNode,
  rawParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import {
  ASSERTIONS_RUNTIME_BYTECODE,
  OPERATIONS_RUNTIME_BYTECODE,
} from "@evmcrispr/test-utils/onchain";
import {
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  http,
} from "viem";
import { foundry } from "viem/chains";
import { indexParam } from "../../../../lang/src/utils/genericCollections";
import exp from "../../../src/helpers/exp";
import ln from "../../../src/helpers/ln";

// Dedicated, unforked EVM: exercise the pinned positional-constraint runtime.
const port = 20000 + Math.floor(Math.random() * 20000);
const client = createPublicClient({
  chain: foundry,
  transport: http(`http://127.0.0.1:${port}`, { retryCount: 0 }),
});
const ctx = {
  core: "0x0000000000000000000000000000000000001001",
  operators: "0x0000000000000000000000000000000000001002",
} as unknown as CompileCtx;
let anvil: ReturnType<typeof Bun.spawn>;
beforeAll(async () => {
  anvil = Bun.spawn(["anvil", "--port", String(port), "--silent"], {
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
  for (const [address, code] of [
    [ctx.core, ASSERTIONS_RUNTIME_BYTECODE],
    [ctx.operators, OPERATIONS_RUNTIME_BYTECODE],
  ]) {
    await client.request({
      method: "anvil_setCode",
      params: [address, code],
    } as never);
  }
});
afterAll(() => anvil?.kill());
async function resolve(param: InputParam): Promise<Hex> {
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(param),
  });
  return data!;
}
const scalar = (value: bigint, checks: Constraint[] = []) =>
  rawParam(toWord(value), checks);

describe("same-word checks on the positional Assertions runtime", () => {
  it("accepts both inclusive boundaries and rejects either side of a merged range", async () => {
    for (const value of [0n, 1n, 42n, 100n, 101n]) {
      const param = constrainWord(
        ctx,
        scalar(value, [constraint("Lte", 100n)]),
        constraint("Gte", 1n),
      );
      if (value === 0n || value === 101n)
        await expect(resolve(param)).rejects.toThrow();
      else expect(await resolve(param)).toBe(toWord(value));
    }
  });

  it("checks OR alternatives and an additional bound on the same word", async () => {
    const alternatives: Constraint = {
      constraintType: 6,
      referenceData: encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "constraintType", type: "uint8" },
              { name: "referenceData", type: "bytes" },
            ],
          },
        ],
        [[constraint("Eq", 0n), constraint("Eq", 42n)]],
      ),
    };
    for (const value of [0n, 42n, 43n]) {
      const param = constrainWord(
        ctx,
        scalar(value, [alternatives]),
        constraint("Gte", 1n),
      );
      if (value === 42n) expect(await resolve(param)).toBe(toWord(value));
      else await expect(resolve(param)).rejects.toThrow();
    }
  });

  it("preserves signed checks and rejects malformed or impossible checks at runtime", async () => {
    const signed: Constraint = {
      constraintType: 4,
      referenceData: toWord(-10n),
    };
    expect(
      await resolve(
        constrainWord(ctx, scalar(42n, [signed]), constraint("Lte", 100n)),
      ),
    ).toBe(toWord(42n));
    await expect(
      resolve(
        constrainWord(ctx, scalar(-11n, [signed]), constraint("Gte", 1n)),
      ),
    ).rejects.toThrow();
    await expect(
      resolve(
        constrainWord(ctx, scalar(-1n, [signed]), constraint("Lte", 100n)),
      ),
    ).rejects.toThrow();
    for (const check of [
      constraint("Lte", 0n),
      inConstraint(100n, 1n),
      { constraintType: 2, referenceData: "0x01" } as Constraint,
    ]) {
      const param = constrainWord(
        ctx,
        scalar(42n, [check]),
        constraint("Gte", 1n),
      );
      await expect(resolve(param)).rejects.toThrow();
      const lazy = staticCallParam(
        ctx.core,
        encodeCond(scalar(0n), param, scalar(7n)),
      );
      expect(await resolve(lazy)).toBe(toWord(7n));
    }
  });

  it("retains constraints on later words and never reinterprets them as word 0", async () => {
    for (const second of [9n, 10n]) {
      const input = rawParam(`${toWord(42n)}${toWord(second).slice(2)}`, [
        constraint("Lte", 100n),
        constraint("Eq", 9n),
      ]);
      const param = constrainWord(ctx, input, constraint("Gte", 1n));
      if (second === 9n) expect(await resolve(param)).toBe(input.paramData);
      else await expect(resolve(param)).rejects.toThrow();
    }
    const invalid = scalar(42n, [
      constraint("Lte", 100n),
      constraint("Gte", 1n),
    ]);
    await expect(
      resolve(constrainWord(ctx, invalid, constraint("Lte", INT256_MAX))),
    ).rejects.toThrow();
  });
});

async function compile(
  name: "index" | "exp" | "ln",
  value: bigint,
  check: Constraint,
) {
  const node = operandNode({
    kind: "call",
    cat: "Uint",
    param: scalar(value, [check]),
  });
  if (name === "index") {
    const param = await indexParam(ctx, node);
    return { param, guarded: param };
  }
  const helper = (name === "exp" ? exp : ln) as unknown as {
    compile: HelperCompile;
  };
  const result = await helper.compile(ctx, {
    type: NodeType.HelperFunctionExpression,
    name: `${name}!`,
    args: [node],
  } as HelperFunctionNode);
  if (result.kind !== "call") throw new Error("expected runtime math");
  const [, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    result.param.paramData,
  );
  const call = decodeFunctionData({ abi: CORE_ABI, data });
  if (call.functionName !== "read") throw new Error("expected Operations read");
  return { param: result.param, guarded: call.args[2][0] as InputParam };
}

for (const name of ["index", "exp", "ln"] as const) {
  it(`${name} merges an existing lower bound with its int256 upper bound`, async () => {
    const value = 10n ** 18n;
    const { param, guarded } = await compile(
      name,
      value,
      constraint("Gte", 1n),
    );
    expect(guarded.constraints).toEqual([inConstraint(1n, INT256_MAX)]);
    const expected =
      name === "index" ? value : name === "exp" ? expWad(value) : lnWad(value);
    expect(
      decodeAbiParameters([{ type: "int256" }], await resolve(param))[0],
    ).toBe(expected);
  });
  it(`${name} rejects failures of either the existing check or the new upper bound`, async () => {
    const value = 10n ** 18n;
    const existingFailure = await compile(
      name,
      value,
      constraint("Gte", value + 1n),
    );
    await expect(resolve(existingFailure.param)).rejects.toThrow();
    const overflow = await compile(
      name,
      INT256_MAX + 1n,
      constraint("Gte", 1n),
    );
    await expect(resolve(overflow.param)).rejects.toThrow();
  });
}
