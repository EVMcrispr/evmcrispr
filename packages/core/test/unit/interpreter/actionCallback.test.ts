import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type { Action } from "@evmcrispr/sdk";
import { custom } from "viem";
import { evml, Interpreter } from "../../../src/index";

// Block commands (`if`, `loop`, def bodies) thread the action callback into
// their block AND return the block's actions as their own result, so the
// same action object reaches the execution boundary twice. These tests pin
// the guard that keeps every action executing exactly once.
describe("Interpreter - action callback", () => {
  const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
  const EXEC = `exec 0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75 "transfer(address,uint256)" ${ACCOUNT} 1`;

  // Only `eth_chainId` is needed (chain-id stamping); anything else is a bug.
  const fakeTransport = custom({
    request: async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected RPC call: ${method}`);
    },
  });

  const interpretCounting = async (script: string) => {
    const interpreter = new Interpreter(evml.registry, {
      account: ACCOUNT,
      transports: { 1: fakeTransport },
    });
    const seen: Action[] = [];
    const returned = await interpreter.interpret(script, async (action) => {
      seen.push(action);
      return undefined;
    });
    return { seen, returned };
  };

  it("executes a top-level action once", async () => {
    const { seen, returned } = await interpretCounting(EXEC);
    expect(seen.length).toBe(1);
    expect(returned.length).toBe(1);
  });

  it("executes an action inside an if block once", async () => {
    const { seen, returned } = await interpretCounting(
      `if @bool(1 > 0) (\n  ${EXEC}\n)`,
    );
    expect(seen.length).toBe(1);
    expect(returned.length).toBe(1);
  });

  it("executes an action inside nested if blocks once", async () => {
    const { seen, returned } = await interpretCounting(
      `if @bool(1 > 0) (\n  if @bool(1 > 0) (\n    ${EXEC}\n  )\n)`,
    );
    expect(seen.length).toBe(1);
    expect(returned.length).toBe(1);
  });

  it("still executes distinct actions in the same block separately", async () => {
    const { seen, returned } = await interpretCounting(
      `if @bool(1 > 0) (\n  ${EXEC}\n  ${EXEC}\n)`,
    );
    expect(seen.length).toBe(2);
    expect(returned.length).toBe(2);
  });

  it("executes a batch as a single batched action", async () => {
    const { seen } = await interpretCounting(
      `batch (\n  ${EXEC}\n  ${EXEC}\n)`,
    );
    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe("batched");
  });
});
