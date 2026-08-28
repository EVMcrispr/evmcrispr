import { describe, expect, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { actionsToCalls } from "../../src/runner/calls";

const EXECUTOR = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
const OTHER = "0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71";
const TARGET = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";
const DATA =
  "0x095ea7b3000000000000000000000000000000000000000000000000000000000000dead";

describe("actionsToCalls", () => {
  it("maps contract calls, value as a decimal string only when set", () => {
    expect(
      actionsToCalls(
        [
          { to: TARGET, data: DATA },
          {
            to: TARGET,
            data: DATA,
            value: 0n,
            from: EXECUTOR.toLowerCase() as any,
          },
          { to: TARGET, data: DATA, value: 10n ** 18n },
        ],
        EXECUTOR,
      ),
    ).toEqual([
      { to: TARGET, data: DATA },
      { to: TARGET, data: DATA },
      { to: TARGET, data: DATA, value: "1000000000000000000" },
    ]);
  });
  it("flattens batches from the executor", () => {
    const batch: Action = {
      type: "batched",
      chainId: 100,
      from: EXECUTOR,
      actions: [
        { to: TARGET, data: DATA },
        { to: OTHER, data: DATA },
      ],
    };
    expect(actionsToCalls([batch], EXECUTOR)).toHaveLength(2);
    expect(() => actionsToCalls([{ ...batch, from: OTHER }], EXECUTOR)).toThrow(
      "cannot run from the dedicated msg.sender",
    );
  });
  it("rejects what a task cannot execute, naming the reason", () => {
    const cases: [Action, string][] = [
      [
        { to: TARGET, data: DATA, from: OTHER },
        "cannot run from the dedicated msg.sender",
      ],
      [{ to: TARGET, data: "0x" }, "plain ETH transfers are not supported"],
      [{ to: TARGET, data: "0x1234" }, "plain ETH transfers are not supported"],
      [{ data: DATA }, "contract creation is not supported"],
      [
        { to: TARGET, data: DATA, readOnly: true },
        "assertions are not supported",
      ],
      [
        { type: "wallet", method: "wallet_switchEthereumChain", params: [] },
        "switching chains is not supported",
      ],
      [
        { type: "wallet", method: "personal_sign", params: [] },
        "wallet requests (personal_sign)",
      ],
      [
        { type: "rpc", method: "anvil_setBalance", params: [] },
        "anvil_setBalance is not supported",
      ],
      [
        { type: "terminal", command: "wait", args: {} },
        "wait is not supported",
      ],
    ];
    for (const [action, message] of cases) {
      expect(() => actionsToCalls([action], EXECUTOR)).toThrow(message);
    }
  });
});
