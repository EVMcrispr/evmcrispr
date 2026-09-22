import { describe, expect, it } from "bun:test";
import { getEncodedCall, type TransactionAction } from "@evmcrispr/sdk";
import { rawParam, runtimeValue, toWord } from "@evmcrispr/sdk/onchain";
import { ADAPTERS } from "../../src/plugins/registry";

const target = "0x1111111111111111111111111111111111111111";
const id = runtimeValue(
  rawParam(toWord(7n)),
  { type: "uint256" },
  `0x${"12".repeat(32)}`,
);
const flag = runtimeValue(rawParam(toWord(1n)), { type: "bool" }, id.batchId);
describe("smart governance lifecycle calls", () => {
  for (const adapter of ADAPTERS)
    it(adapter.id, () => {
      const methods = [
        adapter.buildApprove && (() => adapter.buildApprove!(target, id, flag)),
        adapter.buildVote && (() => adapter.buildVote!(target, id, 2, flag)),
        adapter.buildExecute && (() => adapter.buildExecute!(target, id)),
      ].filter(Boolean);
      if (adapter.id === "admin") {
        expect(methods).toHaveLength(0);
        return;
      }
      expect(methods.length).toBeGreaterThan(0);
      for (const invoke of methods) {
        const actions = invoke!();
        expect(actions).toHaveLength(1);
        const call = getEncodedCall(actions[0] as TransactionAction)!;
        expect(call.target).toBe(target);
        expect(call.args[0]).toBe(id);
        if (call.args.length > 1) expect(call.args.at(-1)).toBe(flag);
      }
    });
});
