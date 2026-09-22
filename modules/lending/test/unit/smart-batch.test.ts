import { describe, expect, it } from "bun:test";
import { getEncodedCall, type TransactionAction } from "@evmcrispr/sdk";
import { rawParam, runtimeValue, toWord } from "@evmcrispr/sdk/onchain";
import type Lending from "../../src";
import { ADAPTERS } from "../../src/adapters/registry";

const from = "0x1111111111111111111111111111111111111111";
const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const amount = runtimeValue(
  rawParam(toWord(7n)),
  { type: "uint256" },
  `0x${"12".repeat(32)}`,
);
const to = runtimeValue(
  rawParam(toWord(BigInt(from))),
  { type: "address" },
  amount.batchId,
);
const module = {
  getClient: async () => ({
    readContract: async (r: { functionName: string }) => {
      if (["getPool", "getPriceOracle"].includes(r.functionName)) return from;
      if (r.functionName === "baseToken") return token;
      if (r.functionName === "getReserveData")
        return { aTokenAddress: from, variableDebtTokenAddress: from };
      throw Error(`Unexpected read: ${r.functionName}`);
    },
  }),
  context: { modules: [] },
} as unknown as Lending;
describe("smart lending adapters", () => {
  for (const adapter of Object.values(ADAPTERS))
    for (const method of [
      "buildSupply",
      "buildBorrow",
      "buildWithdraw",
      "buildRepay",
    ] as const)
      it(`${adapter.name} ${method}`, async () => {
        const plan = await adapter[method](module, {
          chainId: 1,
          token,
          amount,
          from,
          to: to as any,
          onBehalfOf:
            adapter.name === "CompoundV3" && method === "buildBorrow"
              ? from
              : (to as any),
        });
        expect(plan.actions).toHaveLength(1);
        const call = getEncodedCall(plan.actions[0] as TransactionAction)!;
        expect(call.args).toContain(amount);
        if (!(adapter.name === "CompoundV3" && method === "buildBorrow"))
          expect(call.args).toContain(to);
        const ordinary = await adapter[method](module, {
          chainId: 1,
          token,
          amount: 7n,
          from,
          to: from,
          onBehalfOf: from,
        });
        expect(
          (ordinary.actions[0] as TransactionAction).data?.startsWith("0x"),
        ).toBe(true);
      });
});
