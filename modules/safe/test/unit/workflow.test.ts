import { describe, expect, it } from "bun:test";
import { evml } from "@evmcrispr/core";
import { custom, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { stringifySafeTransaction } from "../../src/utils/offline";
import { buildSafeTx } from "../../src/utils/safeTx";
import { transactionSignable } from "../../src/utils/signables";

evml.use({ name: "safe", load: () => import("../../src") });
evml.use({ name: "http", load: () => import("../../../http/src") });
const safe = "0x1111111111111111111111111111111111111111";
const signable = stringifySafeTransaction(
  transactionSignable(1, safe, buildSafeTx([{ to: safe }], 0n)),
);
const transport = custom({
  request: async () => {
    throw new Error("RPC forbidden");
  },
});
describe("composable Safe EVML workflow", () => {
  it("verifies with no network access, signs via std, and merges offline", async () => {
    const account = privateKeyToAccount(toHex(1n, { size: 32 }));
    const logs: string[] = [];
    await evml
      .with({
        chainId: 1,
        account: account.address,
        transports: { 1: transport },
        onLog: (s) => logs.push(s),
      })
      .script(`
load safe
load http
set $tx ${JSON.stringify(signable)}
set $review @safe:verify(${safe} $tx no-rpc:true)
sign $sig --typed @http:json($review typedData)
set $signed @safe:merge($tx $sig)
set $signedReview @safe:verify(${safe} $signed no-rpc:true)
print @http:json($signedReview signatures)
`)
      .execute(undefined, {
        handlers: {
          wallet: async (action) =>
            account.signTypedData(JSON.parse(action.params[1])),
        },
      });
    expect(logs.join("\n")).toContain("EIP-712 signing payload");
    expect(logs.join("\n")).toContain("recovered");
  });
  it("recognizes output variables in static validation", async () => {
    const result = await evml
      .script(
        `load safe\nload http\nset $review @safe:verify(${safe} ${JSON.stringify(signable)} no-rpc:true)\nprint @http:json($review hashes)`,
      )
      .validate();
    expect(result.diagnostics).toEqual([]);
  });
  it("can select a chain and inspect without wallet or RPC access", async () => {
    await evml
      .with({ transports: { 1: transport } })
      .script(
        `load safe\nswitch 1\nset $report @safe:verify(${safe} ${JSON.stringify(signable)} no-rpc:true)`,
      )
      .execute(undefined);
  });
});
