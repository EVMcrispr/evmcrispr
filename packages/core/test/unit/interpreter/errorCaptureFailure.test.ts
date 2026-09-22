import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type { Action } from "@evmcrispr/sdk";
import { BindingsSpace } from "@evmcrispr/sdk";
import { custom } from "viem";
import { evml, Interpreter } from "../../../src/index";

// Error captures observe a failed command, whether its transaction reverts
// or the command refuses to run in the first place (a failed preflight, an
// invalid amount, a missing argument). These tests pin the second case.
describe("Interpreter - error captures on command failures", () => {
  const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
  const TOKEN = "0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75";
  // One argument short: exec fails while encoding, before any action exists.
  const FAILING = `exec ${TOKEN} "transfer(address,uint256)" ${ACCOUNT}`;
  const WORKING = `exec ${TOKEN} "transfer(address,uint256)" ${ACCOUNT} 1`;

  const fakeTransport = custom({
    request: async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected RPC call: ${method}`);
    },
  });

  const run = async (script: string, withCallback = true) => {
    const interpreter = new Interpreter(evml.registry, {
      account: ACCOUNT,
      transports: { 1: fakeTransport },
    });
    const seen: Action[] = [];
    const returned = await interpreter.interpret(
      script,
      withCallback
        ? async (action) => {
            seen.push(action);
            return undefined;
          }
        : undefined,
    );
    const binding = (name: string) =>
      interpreter.bindingsManager.getBindingValue(name, BindingsSpace.USER);
    return { seen, returned, binding };
  };

  it("-?!> $var is true when the command fails before sending", async () => {
    const { seen, returned, binding } = await run(`${FAILING} -?!> $failed`);
    expect(binding("$failed")).toBe("true");
    expect(seen.length).toBe(0);
    expect(returned.length).toBe(0);
  });

  it("-?!> [$reason] binds the failure message", async () => {
    const { binding } = await run(`${FAILING} -?!> [$reason]`);
    expect(String(binding("$reason"))).toMatch(/encoding|Invalid integer/);
  });

  it("-!> $var accepts a command failure as the expected error", async () => {
    const { binding } = await run(`${FAILING} -!> $failed`);
    expect(binding("$failed")).toBe("true");
  });

  it("a named capture does not match a command failure", async () => {
    const { binding } = await run(`${FAILING} -?!> Unauthorized() $denied`);
    expect(binding("$denied")).toBe("false");
    await expect(run(`${FAILING} -!> Unauthorized()`)).rejects.toThrow(
      /failed before sending/,
    );
  });

  it("the script continues after a captured failure", async () => {
    const { seen, binding } = await run(
      `${FAILING} -?!> $failed\nset $after 1\n${WORKING}`,
    );
    expect(binding("$failed")).toBe("true");
    expect(binding("$after")?.toString()).toBe("1");
    expect(seen.length).toBe(1);
  });

  it("an optional capture without a send context passes the actions through", async () => {
    const { returned, binding } = await run(`${WORKING} -?!> $failed`, false);
    expect(binding("$failed")).toBe("false");
    expect(returned.length).toBe(1);
  });

  it("a required capture without a send context still needs the send", async () => {
    await expect(run(`${WORKING} -!> $failed`, false)).rejects.toThrow(
      /execution context/,
    );
  });
});
