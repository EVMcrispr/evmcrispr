import { describe, expect, it } from "bun:test";
import type { SmartBatchAction } from "@evmcrispr/sdk";
import {
  COMPOSABLE_EXECUTOR_ABI,
  deserializeSmartBatchPlan,
  lowerSmartBatch,
  serializeSmartBatchPlan,
} from "@evmcrispr/sdk/onchain";
import { custom, decodeFunctionData } from "viem";
import { createEvml, Interpreter, parseScript } from "../../../src/index.ts";

const account = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const tag = createEvml();
const compile = async (body: string, salt = "") => {
  const interpreter = new Interpreter(tag.registry, {
    account,
    chainId: 1,
    transports: {
      1: custom({
        request: async () => {
          throw new Error("Unexpected RPC during compilation");
        },
      }),
    },
  });
  return (
    await interpreter.interpret(`batch! ${salt} (\n${body}\n)`)
  )[0] as SmartBatchAction;
};

describe("smart batch compiler", () => {
  it("parses bangs and nested capture placeholders", () => {
    const result = parseScript(
      `safe:execute! ${account} (\nexec ${target} "f() returns ((uint256,address),bool)" -> [[$x _] $ok]\n)`,
    );
    expect(result.errors).toEqual([]);
    expect(result.ast.body[0].name).toBe("execute!");
    expect((result.ast.body[0].args[1] as any).body[0].returnCapture).toEqual([
      ["x", null],
      "ok",
    ]);
  });
  it("serializes ordered output dependencies and deterministic lowering", async () => {
    const salt = `--salt 0x${"ab".repeat(32)}`;
    const body = `exec ${target} "f() returns (uint256,address)" -> [$amount $to]\nexec $to "g(uint256)" $amount`;
    const action = await compile(body, salt);
    expect(action.plan.captures.map((c) => [c.name, c.step, c.word])).toEqual([
      ["amount", 0, 0],
      ["to", 0, 1],
    ]);
    expect(structuredClone(action)).toEqual(action);
    expect(lowerSmartBatch(action.plan)).toEqual(
      lowerSmartBatch((await compile(body, salt)).plan),
    );
    expect(action.plan.steps).toHaveLength(2);
    const consumer = action.plan.steps[1];
    if (consumer.kind !== "composable") throw Error("expected composable step");
    expect(consumer.dynamicFields).toEqual(["target", "arg1"]);
    expect(consumer.reads).toEqual([
      { name: "amount", step: 0, word: 0 },
      { name: "to", step: 0, word: 1 },
    ]);
    expect(consumer.call?.args[0]).toMatchObject({
      kind: "runtime-value",
      abiType: { type: "uint256" },
      output: { step: 0, word: 0 },
    });
    const tx = lowerSmartBatch(action.plan)[0];
    expect(
      decodeFunctionData({ abi: COMPOSABLE_EXECUTOR_ABI, data: tx.data! })
        .functionName,
    ).toBe("executeComposableCall");
  });
  it("captures the first output without requiring slots for trailing outputs", async () => {
    const action = await compile(
      `exec ${target} "f() returns (uint256,address,bool)" -> [$result]`,
    );
    expect(
      action.plan.captures.map((c) => [c.name, c.word, c.type.type]),
    ).toEqual([["result", 0, "uint256"]]);
  });
  it("requires a smart block for return slots while retaining ordinary event capture", async () => {
    const interpreter = new Interpreter(tag.registry, { account, chainId: 1 });
    await expect(
      interpreter.interpret(
        `exec ${target} "f() returns (uint256)" -> [$result]`,
      ),
    ).rejects.toThrow("return capture is only valid");
  });
  it("allocates fresh salts by default", async () => {
    const body = `exec ${target} "f() returns (uint256)" -> [$x]`;
    expect((await compile(body)).plan.salt).not.toBe(
      (await compile(body)).plan.salt,
    );
  });
  it("keeps exact short calldata in outer transactions", async () => {
    const action = await compile(
      `exec ${target} "f()"\nsend ${target} --data 0x1234 --value 1\nexec ${target} "g()"`,
    );
    const calls = lowerSmartBatch(action.plan);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toEqual({ to: target, data: "0x1234", value: 1n });
  });
  it("rejects dynamic returns, undeclared outputs, and use before definition", async () => {
    await expect(
      compile(`exec ${target} "f() returns (bytes)" -> [$x]`),
    ).rejects.toThrow("static ABI results");
    await expect(compile(`exec ${target} "f()" -> [$x]`)).rejects.toThrow(
      "ABI outputs",
    );
    await expect(
      compile(
        `exec ${target} "g(uint256)" $x\nexec ${target} "f() returns (uint256)" -> [$x]`,
      ),
    ).rejects.toThrow();
  });
  it("does not use return values for build-time assignment or branching", async () => {
    const prefix = `exec ${target} "f() returns (uint256)" -> [$x]\n`;
    await expect(compile(`${prefix}set $copy $x`)).rejects.toThrow("runtime");
    await expect(
      compile(`${prefix}if $x (\nexec ${target} "g()"\n)`),
    ).rejects.toThrow("runtime");
    const interpreter = new Interpreter(tag.registry, { account, chainId: 1 });
    await expect(
      interpreter.interpret(
        `batch! (\n${prefix})\nexec ${target} "g(uint256)" $x`,
      ),
    ).rejects.toThrow();
  });
  it("retains ordinary read restrictions and rejects per-step envelopes", async () => {
    await expect(
      compile(
        `exec ${target} "g()"\nexec ${target} "h(uint256)" @balance(ETH @sender)`,
      ),
    ).rejects.toThrow();
    await expect(compile(`send ${target} --gas 21000`)).rejects.toThrow(
      "per-call gas",
    );
    await expect(compile(`batch (\nexec ${target} "g()"\n)`)).rejects.toThrow();
    await expect(compile(`switch 10`)).rejects.toThrow();
  });
  it("compiles nested ABI literals and checks captured types", async () => {
    const action = await compile(
      `exec ${target} "f() returns (uint256)" -> [$x]\nexec ${target} "g((uint256,address)[],uint8)" [[$x @sender]] $x`,
    );
    expect(action.plan.steps).toHaveLength(2);
    await expect(
      compile(
        `exec ${target} "f() returns (bool)" -> [$x]\nexec ${target} "g(uint256)" $x`,
      ),
    ).rejects.toThrow("expected uint256");
  });
  it("expands compile-time loops and user-defined commands without evaluating captured arguments", async () => {
    const action = await compile(
      `def relay "$x: number" (\nexec ${target} "g(uint256)" $x\n)\nexec ${target} "f() returns (uint256)" -> [$x]\nloop $i of [1 2] (\nrelay $x\n)`,
    );
    expect(action.plan.steps).toHaveLength(3);
  });
  it("round-trips JSON plans and rejects dynamic short calldata", async () => {
    const action = await compile(
      `send ${target} --value 4\nexec ${target} "f() returns (uint256)" -> [$x]\nsend ${target} --data 0x12345678 --value $x`,
    );
    expect(
      deserializeSmartBatchPlan(serializeSmartBatchPlan(action.plan)),
    ).toEqual(action.plan);
    await expect(
      compile(
        `exec ${target} "f() returns (uint256)" -> [$x]\nsend ${target} --value $x`,
      ),
    ).rejects.toThrow("short-calldata");
  });

  it("does not leave partial steps after optional compilation error capture", async () => {
    const action = await compile(
      `exec ${target} "f() returns (uint256,bool)" -> [$x [$bad]] -?!> $failed\nexec ${target} "g(uint256)" 7`,
    );
    expect(action.plan.steps).toHaveLength(1);
    expect(action.plan.captures).toHaveLength(0);
    await expect(compile(`exec ${target} "f()" $> $hash`)).rejects.toThrow(
      "receipt-dependent",
    );
  });

  it("points required error captures at assert @reverts!", async () => {
    await expect(compile(`exec ${target} "f()" -!> Failure()`)).rejects.toThrow(
      "required error captures cannot observe a revert inside a smart batch; assert it instead: assert @reverts!(<target>::!{<signature>} -!> Name())",
    );
    await expect(
      compile(`exec ${target} "f()" -> [$x] $*> $txs`),
    ).rejects.toThrow(
      "inner receipt-dependent captures are unsupported in a smart batch; capture the outer command instead",
    );
  });
});
