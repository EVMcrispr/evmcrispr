import { describe, expect, test } from "bun:test";
import { executeScript, ModuleRegistry } from "@evmcrispr/core";
import type { Action } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { reachesWallet } from "../../src/runs/handlers";

// The run manager lets some actions through without asking its gate,
// because the core sends them without the wallet. These tests pin that:
// the core's own handlers run here with no wallet at all, where any
// request to one throws.
const to = "0x000000000000000000000000000000000000dEaD" as const;

/** Sends `action` through the core's built-in handler, without a wallet. */
function send(action: Action) {
  const asked: string[] = [];
  const publicClient = {
    call: async () => {
      asked.push("call");
      return { data: "0x" };
    },
    request: async ({ method }: { method: string }) => {
      asked.push(method);
      return null;
    },
  } as unknown as PublicClient;
  const done = executeScript("", new ModuleRegistry(), {}, undefined, {
    publicClient,
    interpretRunner: async (_source, dispatch) => {
      await dispatch(action);
    },
  });
  return { done, asked };
}

describe("actions the gate lets through never take the wallet", () => {
  const exempt: [string, Action, string[]][] = [
    ["a read-only call", { to, data: "0x", readOnly: true }, ["call"]],
    [
      "an RPC request",
      { type: "rpc", method: "evm_mine", params: [] },
      ["evm_mine"],
    ],
    [
      "a terminal action",
      { type: "terminal", command: "wait", args: { seconds: 0 } },
      [],
    ],
  ];
  for (const [name, action, asks] of exempt)
    test(name, async () => {
      expect(reachesWallet(action)).toBe(false);
      const { done, asked } = send(action);
      await done;
      expect(asked).toEqual(asks);
    });
});

describe("everything else is gated, and does take the wallet", () => {
  const gated: [string, Action][] = [
    ["a transaction", { to, data: "0x", chainId: 1 }],
    [
      "a batch",
      {
        type: "batched",
        chainId: 1,
        from: to,
        actions: [{ to, data: "0x" }],
      },
    ],
    [
      "a wallet request",
      { type: "wallet", method: "personal_sign", params: [] },
    ],
  ];
  for (const [name, action] of gated)
    test(name, async () => {
      expect(reachesWallet(action)).toBe(true);
      await expect(send(action).done).rejects.toThrow(
        "Wallet access is required",
      );
    });

  test("a transaction another account signs is observed, and held all the same", () => {
    // It needs no signature here, but it is not let through: gating it
    // costs a pause, letting it through would rest on what it claims.
    expect(reachesWallet({ to, data: "0x", from: to })).toBe(true);
  });
});
