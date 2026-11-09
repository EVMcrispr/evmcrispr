import "../setup";
import { describe, expect, it } from "bun:test";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { toFunctionSelector } from "viem";
import type { FrameModuleAction } from "../../src/frame-action";

const A1 = "0x0000000000000000000000000000000000000001";
const A2 = "0x0000000000000000000000000000000000000002";
const PAYMASTER = "0x00000000000000000000000000000000000000aa";
const SELECTOR = toFunctionSelector("f()");

const run = async (script: string, chainId = 1337) => {
  const interpreter = createInterpreter(script, undefined as never, {
    chainId,
  });
  return (await interpreter.interpret()) as FrameModuleAction[];
};

describe("frame > commands", () => {
  it("tx with one exec", async () => {
    const [action, ...rest] = await run(
      `load frames [tx]\ntx (\n  exec ${A1} "f()"\n)`,
    );
    expect(rest).toHaveLength(0);
    expect(action).toMatchObject({
      type: "module",
      module: "frames",
      kind: "frame",
      chainId: 1337,
      from: TEST_ACCOUNT_ADDRESS,
      data: { mempool: "alt" },
    });
    expect(action.description.title).toBe(
      `Frame transaction from ${TEST_ACCOUNT_ADDRESS}`,
    );
    expect(action.data.frames).toHaveLength(2);
    expect(action.data.frames[0]).toMatchObject({
      mode: "verify",
      approve: "both",
      target: null,
    });
    expect(action.data.frames[1]).toMatchObject({
      mode: "sender",
      target: A1,
      data: SELECTOR,
    });
  });

  it("exec --gas sets the frame's execution gas", async () => {
    const [action] = await run(
      `load frames [tx]\ntx (\n  exec ${A1} "f()" --gas 77000\n)`,
    );
    expect(action.data.frames[1].gas).toBe(77000n);
  });

  it("a written verify gets the builders' default gas", async () => {
    const [own] = await run(`load frames [tx verify]
tx (
  verify @me --approve both
)`);
    expect(own.data.frames[0].gas).toBe(30_000n);
    const [paid] = await run(`load frames [tx verify]
tx (
  verify @me --approve execution
  verify ${A2} "verify()" --approve payment
)`);
    expect(paid.data.frames.map((f) => f.gas)).toEqual([30_000n, 50_000n]);
    const [set] = await run(`load frames [tx verify]
tx (
  verify @me --approve both --gas 77000
)`);
    expect(set.data.frames[0].gas).toBe(77_000n);
  });

  it("tx --state-gas sets the body's state gas", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --state-gas 9000 (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.data.frames[0].stateGas).toBeUndefined();
    expect(action.data.frames[1].stateGas).toBe(9000n);
  });

  it("the explicit paymaster shape from the spec", async () => {
    const [action] = await run(`load frames [tx verify default]
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
    expect(action.data.frames.map((f) => f.mode)).toEqual([
      "verify",
      "default",
      "verify",
      "sender",
      "sender",
      "sender",
    ]);
    expect(action.data.frames[0]).toMatchObject({
      approve: "execution",
      target: null,
    });
    expect(action.data.frames[2]).toMatchObject({
      approve: "payment",
      target: A2,
      data: toFunctionSelector("verify()"),
    });
  });

  it("a batch inside tx is an atomic group", async () => {
    const [action] = await run(`load frames [tx]
tx (
  batch (
    exec ${A1} "f()"
    exec ${A2} "g()"
  )
)`);
    expect(action.data.frames).toHaveLength(3);
    expect(action.data.frames[1]).toMatchObject({
      mode: "sender",
      atomic: true,
    });
    expect(action.data.frames[2].atomic).toBeUndefined();
  });

  it("--paymaster generates the verify and pay frames", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --paymaster ${PAYMASTER} --paymaster-data 0x1234 (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.data.frames[1]).toMatchObject({
      approve: "payment",
      target: PAYMASTER,
      data: "0x1234",
    });
  });

  it("default outside frames:tx is refused", async () => {
    await expect(
      run(`load frames [default]\ndefault (\n  exec ${A1} "f()"\n)`),
    ).rejects.toThrow(/only works inside frames:tx/);
  });

  it("verify outside frames:tx is refused", async () => {
    await expect(
      run(`load frames [verify]\nverify @me --approve both`),
    ).rejects.toThrow(/only works inside frames:tx/);
  });

  it("--approve is required and checked", async () => {
    await expect(
      run(`load frames [tx verify]\ntx (\n  verify @me\n)`),
    ).rejects.toThrow(/--approve/);
    await expect(
      run(`load frames [tx verify]\ntx (\n  verify @me --approve all\n)`),
    ).rejects.toThrow(/--approve/);
  });

  it("--mempool canonical sets mempool", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --mempool canonical (\n  exec ${A1} "f()"\n)`,
    );
    expect(action.data.mempool).toBe("canonical");
  });

  it("--mempool defaults to the network's: alt with a sidecar, else canonical", async () => {
    const block = `load frames [tx]\ntx (\n  exec ${A1} "f()"\n)`;
    expect((await run(block))[0]!.data.mempool).toBe("alt");
    expect((await run(block, 81412))[0]!.data.mempool).toBe("canonical");
  });

  it("tx --gas is the execution gas of every call written without its own", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --gas 77000 (\n  exec ${A1} "f()"\n  exec ${A1} "g()" --gas 5000\n)`,
    );
    expect(action!.data.frames.map((f) => f.gas)).toEqual([
      30_000n,
      77_000n,
      5_000n,
    ]);
  });

  it("an empty block yields no action", async () => {
    expect(await run(`load frames [tx]\ntx (\n)`)).toHaveLength(0);
  });
  it("a verify inside default is refused", async () => {
    await expect(
      run(`load frames [tx verify default]
tx (
  default (
    verify @me --approve both
  )
)`),
    ).rejects.toThrow(/verify cannot go inside default/);
    await expect(
      run(`load frames [tx verify default]
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
          `load frames [tx verify]\ntx (\n  verify @me --approve both --gas ${gas}\n)`,
        ),
      ).rejects.toThrow(/--gas must be a non-negative integer/);
  });

  it("tx --state-gas must be a non-negative integer", async () => {
    for (const gas of ["-1", "1.5"])
      await expect(
        run(`load frames [tx]\ntx --state-gas ${gas} (\n  exec ${A1} "f()"\n)`),
      ).rejects.toThrow(/--state-gas must be a non-negative integer/);
  });

  it("tx --account makes the account the sender and marks the action", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --account ${A2} --state-gas 1 (\n  exec ${A1} "f()" --gas 1\n  set $s @sender\n)`,
    );
    expect(action.from).toBe(A2);
    expect(action.data.account).toEqual({
      kind: "frame-account",
      owner: TEST_ACCOUNT_ADDRESS,
    });
    expect(action.data.frames[0].data.startsWith("0xb2225351")).toBe(true);
    expect(action.data.frames[0].gas).toBe(40_000n);
  });

  it("tx --account refuses a call without --gas", async () => {
    await expect(
      run(
        `load frames [tx]\ntx --account ${A2} --state-gas 1 (\n  exec ${A1} "f()"\n)`,
      ),
    ).rejects.toThrow(/Frame 2 has no gas limit: give its exec or send --gas/);
  });

  it("tx without --state-gas reserves 200000 state gas for every body frame", async () => {
    const [action] = (await run(
      `load frames [tx]\ntx --account ${A2} (\n  exec ${A1} "f()" --gas 1\n)`,
    )) as any[];
    expect(action.data.frames[0].stateGas).toBeUndefined();
    expect(action.data.frames[1].stateGas).toBe(200_000n);
  });

  it("tx --account refuses a pre_verify without --gas", async () => {
    await expect(
      run(
        `load frames [tx verify default]\ntx --account ${A2} --state-gas 1 (\n  verify @sender --approve execution\n  default (\n    exec ${A1} "pullFee()"\n  )\n  verify ${A1} "verify()" --approve payment\n  exec ${A1} "f()" --gas 1\n)`,
      ),
    ).rejects.toThrow(
      /Frame 2 is in the validation prefix and has no gas limit/,
    );
  });

  it("tx without --account leaves limits to the host", async () => {
    const [action] = await run(`load frames [tx]\ntx (\n  exec ${A1} "f()"\n)`);
    expect(action.data.frames[1].gas).toBeUndefined();
  });

  it("@sender is the account inside the block and @me the wallet", async () => {
    const [action] = await run(
      `load frames [tx]\ntx --account ${A2} --state-gas 1 (\n  exec @sender "f()" --gas 1\n  exec @me "g()" --gas 1\n)`,
    );
    expect(action.data.frames[1].target).toBeNull();
    expect(action.data.frames[2].target).toBe(TEST_ACCOUNT_ADDRESS);
  });
});
