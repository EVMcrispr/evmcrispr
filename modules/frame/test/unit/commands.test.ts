import "../setup";
import { describe, expect, it } from "bun:test";
import type { FrameAction } from "@evmcrispr/sdk";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { toFunctionSelector } from "viem";

const A1 = "0x0000000000000000000000000000000000000001";
const A2 = "0x0000000000000000000000000000000000000002";
const PAYMASTER = "0x00000000000000000000000000000000000000aa";
const SELECTOR = toFunctionSelector("f()");

const run = async (script: string) => {
  const interpreter = createInterpreter(script, undefined as never, {
    chainId: 1337,
  });
  return (await interpreter.interpret()) as FrameAction[];
};

describe("frame > commands", () => {
  it("tx with one exec", async () => {
    const [action, ...rest] = await run(
      `load frame [tx]\ntx (\n  exec ${A1} "f()"\n)`,
    );
    expect(rest).toHaveLength(0);
    expect(action).toMatchObject({
      type: "frame",
      chainId: 1337,
      from: TEST_ACCOUNT_ADDRESS,
      mempool: "alt",
    });
    expect(action.frames).toHaveLength(2);
    expect(action.frames[0]).toMatchObject({
      mode: "verify",
      approve: "both",
      target: null,
    });
    expect(action.frames[1]).toMatchObject({
      mode: "sender",
      target: A1,
      data: SELECTOR,
    });
  });

  it("exec --gas sets the frame's execution gas", async () => {
    const [action] = await run(
      `load frame [tx]\ntx (\n  exec ${A1} "f()" --gas 77000\n)`,
    );
    expect(action.frames[1].gas).toBe(77000n);
  });

  it("a written verify gets the builders' default gas", async () => {
    const [own] = await run(`load frame [tx verify]
tx (
  verify @me --approve both
)`);
    expect(own.frames[0].gas).toBe(30_000n);
    const [paid] = await run(`load frame [tx verify]
tx (
  verify @me --approve execution
  verify ${A2} "verify()" --approve payment
)`);
    expect(paid.frames.map((f) => f.gas)).toEqual([30_000n, 50_000n]);
    const [set] = await run(`load frame [tx verify]
tx (
  verify @me --approve both --gas 77000
)`);
    expect(set.frames[0].gas).toBe(77_000n);
  });

  it("tx --state-gas sets the body's state gas", async () => {
    const [action] = await run(
      `load frame [tx]\ntx --state-gas 9000 (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.frames[0].stateGas).toBeUndefined();
    expect(action.frames[1].stateGas).toBe(9000n);
  });

  it("the explicit paymaster shape from the spec", async () => {
    const [action] = await run(`load frame [tx verify default]
tx (
  verify @me --approve execution
  default (
    exec ${A2} "pullFee(address,uint256)" @me 1000000
  )
  verify ${A2} "verify()" --approve payment
  exec ${A1} "approve(address,uint256)" ${A2} 100
  batch (
    exec ${A1} "f()"
    exec ${A2} "g()"
  )
)`);
    expect(action.frames.map((f) => f.mode)).toEqual([
      "verify",
      "default",
      "verify",
      "sender",
      "sender",
      "sender",
    ]);
    expect(action.frames[0]).toMatchObject({
      approve: "execution",
      target: null,
    });
    expect(action.frames[2]).toMatchObject({
      approve: "payment",
      target: A2,
      data: toFunctionSelector("verify()"),
    });
  });

  it("a batch inside tx is an atomic group", async () => {
    const [action] = await run(`load frame [tx]
tx (
  batch (
    exec ${A1} "f()"
    exec ${A2} "g()"
  )
)`);
    expect(action.frames).toHaveLength(3);
    expect(action.frames[1]).toMatchObject({ mode: "sender", atomic: true });
    expect(action.frames[2].atomic).toBeUndefined();
  });

  it("--paymaster generates the verify and pay frames", async () => {
    const [action] = await run(
      `load frame [tx]\ntx --paymaster ${PAYMASTER} --paymaster-data 0x1234 (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.frames[1]).toMatchObject({
      approve: "payment",
      target: PAYMASTER,
      data: "0x1234",
    });
  });

  it("default outside frame:tx is refused", async () => {
    await expect(
      run(`load frame [default]\ndefault (\n  exec ${A1} "f()"\n)`),
    ).rejects.toThrow(/only works inside frame:tx/);
  });

  it("verify outside frame:tx is refused", async () => {
    await expect(
      run(`load frame [verify]\nverify @me --approve both`),
    ).rejects.toThrow(/only works inside frame:tx/);
  });

  it("--approve is required and checked", async () => {
    await expect(
      run(`load frame [tx verify]\ntx (\n  verify @me\n)`),
    ).rejects.toThrow(/--approve/);
    await expect(
      run(`load frame [tx verify]\ntx (\n  verify @me --approve all\n)`),
    ).rejects.toThrow(/--approve/);
  });

  it("--mempool canonical sets mempool", async () => {
    const [action] = await run(
      `load frame [tx]\ntx --mempool canonical (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.mempool).toBe("canonical");
  });

  it("an empty block yields no action", async () => {
    expect(await run(`load frame [tx]\ntx (\n)`)).toHaveLength(0);
  });
  it("a verify inside default is refused", async () => {
    await expect(
      run(`load frame [tx verify default]
tx (
  default (
    verify @me --approve both
  )
)`),
    ).rejects.toThrow(/verify cannot go inside default/);
    await expect(
      run(`load frame [tx verify default]
tx (
  default (
    batch (
      exec ${A1} "f()"
      verify @me --approve both
    )
  )
)`),
    ).rejects.toThrow(/verify cannot go inside default/);
  });

  it("verify --gas must be a non-negative integer", async () => {
    for (const gas of ["-1", "1.5"])
      await expect(
        run(
          `load frame [tx verify]\ntx (\n  verify @me --approve both --gas ${gas}\n)`,
        ),
      ).rejects.toThrow(/--gas must be a non-negative integer/);
  });

  it("tx --state-gas must be a non-negative integer", async () => {
    for (const gas of ["-1", "1.5"])
      await expect(
        run(`load frame [tx]\ntx --state-gas ${gas} (\n  exec ${A1} "f()"\n)`),
      ).rejects.toThrow(/--state-gas must be a non-negative integer/);
  });

  it("tx --account makes the account the sender and marks the action", async () => {
    const [action] = await run(
      `load frame [tx]\ntx --account ${A2} (\n  exec ${A1} "f()"\n  set $s @sender\n)`,
    );
    expect(action.from).toBe(A2);
    expect(action.account).toEqual({
      kind: "frame-account",
      owner: TEST_ACCOUNT_ADDRESS,
    });
    expect(action.frames[0].data.startsWith("0xb2225351")).toBe(true);
    expect(action.frames[0].gas).toBe(40_000n);
  });

  it("@sender is the account inside the block and @me the wallet", async () => {
    const [action] = await run(
      `load frame [tx]\ntx --account ${A2} (\n  exec @sender "f()"\n  exec @me "g()"\n)`,
    );
    expect(action.frames[1].target).toBeNull();
    expect(action.frames[2].target).toBe(TEST_ACCOUNT_ADDRESS);
  });
});
