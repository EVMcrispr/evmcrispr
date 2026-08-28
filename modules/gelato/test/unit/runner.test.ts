import { beforeAll, describe, expect, it } from "bun:test";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { toFunctionSelector } from "viem";
import { anvilUrl } from "../../../../scripts/anvil-config";
import { type RunnerContext, run } from "../../src/runner/run";

const USDC = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";
const SPENDER = "0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71";
const APPROVE = `exec ${USDC} approve(address,uint256) ${SPENDER} 1`;
/** The dedicated msg.sender the fake task executes from. */
const EXECUTOR = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

/** A context like Gelato's: the provider stub forwards JSON-RPC to anvil
 *  and records what reached it. */
function context(
  script: string,
  rpcUrl = "",
): RunnerContext & { seen: string[] } {
  const seen: string[] = [];
  let id = 0;
  return {
    seen,
    userArgs: {
      script,
      account: TEST_ACCOUNT_ADDRESS,
      sender: EXECUTOR,
      rpcUrl,
    },
    gelatoArgs: { chainId: 100, gasPrice: "1" },
    multiChainProvider: {
      chainId: () => ({
        async send(method, params) {
          seen.push(method);
          const res = await fetch(anvilUrl(), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          });
          const body = (await res.json()) as {
            result?: unknown;
            error?: { message: string; code: number; data?: unknown };
          };
          if (body.error) {
            // ethers v5 nests the node's error the same way
            throw Object.assign(new Error("call failed"), {
              error: body.error,
            });
          }
          return body.result;
        },
      }),
    },
  };
}

describe("EVML runner", () => {
  beforeAll(async () => {
    // module registration of the runner and the test setup share the registry
    await import("../setup");
  });

  it("returns the calls a script produces, from the executor", async () => {
    const ctx = context(APPROVE);
    const result = await run(ctx);
    expect(result).toEqual({
      canExec: true,
      callData: [
        {
          to: USDC,
          data: expect.stringMatching(
            new RegExp(`^${toFunctionSelector("approve(address,uint256)")}`),
          ),
        },
      ],
    });
    expect(ctx.seen).not.toContain("eth_chainId");
  });

  it("tells @me (the wallet) and @sender (the executor) apart", async () => {
    const result = await run(
      context(
        `exec ${USDC} approve(address,uint256) @me 1\nexec ${USDC} approve(address,uint256) @sender 2`,
      ),
    );
    expect(result.canExec).toBe(true);
    const [me, sender] = (result as { callData: { data: string }[] }).callData;
    expect(me.data.toLowerCase()).toContain(
      TEST_ACCOUNT_ADDRESS.slice(2).toLowerCase(),
    );
    expect(sender.data.toLowerCase()).toContain(
      EXECUTOR.slice(2).toLowerCase(),
    );
  });

  it("reads through the user's RPC when the task names one", async () => {
    const ctx = context(
      `set $s ${USDC}::{decimals()(uint8)}\n${APPROVE}`,
      anvilUrl(),
    );
    const result = await run(ctx);
    expect(result).toEqual({ canExec: true, callData: expect.any(Array) });
    expect(ctx.seen).toEqual([]);
  });

  it("skips the execution when the script exits before any call", async () => {
    expect(await run(context(`exit\n${APPROVE}`))).toEqual({
      canExec: false,
      message: "the script produced no calls",
    });
  });

  it("reports script errors instead of executing", async () => {
    const result = await run(context("load sim"));
    expect(result.canExec).toBe(false);
    expect((result as { message: string }).message).toContain("sim");
  });

  it("refuses calls a task cannot make", async () => {
    const other = await run(context(`${APPROVE} --from ${SPENDER}`));
    expect((other as { message: string }).message).toContain(
      "cannot run from the dedicated msg.sender",
    );
    const chain = await run(context(`switch 1\n${APPROVE}`));
    expect((chain as { message: string }).message).toContain(
      "switching chains",
    );
  });

  it("carries value as a decimal string", async () => {
    const result = await run(context(`${APPROVE} --value 1e18`));
    expect(result).toEqual({
      canExec: true,
      callData: [
        { to: USDC, data: expect.any(String), value: "1000000000000000000" },
      ],
    });
  });
});
