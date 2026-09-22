import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type { Action } from "@evmcrispr/sdk";
import { BindingsSpace, CommandError } from "@evmcrispr/sdk";
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

  const session = (withCallback = true) => {
    const interpreter = new Interpreter(evml.registry, {
      account: ACCOUNT,
      transports: { 1: fakeTransport },
    });
    const seen: Action[] = [];
    return {
      seen,
      binding: (name: string) =>
        interpreter.bindingsManager.getBindingValue(name, BindingsSpace.USER),
      exec: (script: string) =>
        interpreter.interpret(
          script,
          withCallback
            ? async (action) => {
                seen.push(action);
                return undefined;
              }
            : undefined,
        ),
    };
  };

  const run = async (script: string, withCallback = true) => {
    const { seen, binding, exec } = session(withCallback);
    const returned = await exec(script);
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

  // A named clause that does not match no longer swallows the failure:
  // the original error propagates, through the interpreter's usual
  // location-prefixed wrapper, and nothing is bound.
  it("an unmatched named capture propagates the original failure", async () => {
    const { binding, exec } = session();
    await expect(
      exec(`${FAILING} -?!> Unauthorized() $denied`),
    ).rejects.toThrow(/Invalid integer value/);
    expect(binding("$denied")).toBeUndefined();

    await expect(run(`${FAILING} -!> Unauthorized()`)).rejects.toThrow(
      /Invalid integer value/,
    );
  });

  it("the propagated failure keeps its location and cause", async () => {
    let thrown: unknown;
    try {
      await run(`${FAILING} -?!> Unauthorized() $denied`);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CommandError);
    expect((thrown as Error).message).toMatch(/^exec\(1:0/);
    expect(String(((thrown as Error).cause as Error)?.message)).toMatch(
      /Invalid integer value/,
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
