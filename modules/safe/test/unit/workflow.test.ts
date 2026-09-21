import { describe, expect, it } from "bun:test";
import { evml } from "@evmcrispr/core";
import { custom, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { stringifySafeTransaction } from "../../src/utils/offline";
import { transactionPackage } from "../../src/utils/packages";
import { buildSafeTx } from "../../src/utils/safeTx";

evml.use({ name: "safe", load: () => import("../../src") });
evml.use({ name: "http", load: () => import("../../../http/src") });
const safe = "0x1111111111111111111111111111111111111111";
const pkg = stringifySafeTransaction(
  transactionPackage(1, safe, buildSafeTx([{ to: safe }], 0n)),
);
const transport = custom({
  request: async () => {
    throw new Error("RPC forbidden");
  },
});
describe("composable Safe EVML workflow", () => {
  it("binds reports without reading an unbound output variable, signs via std, and merges offline", async () => {
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
set $tx ${JSON.stringify(pkg)}
safe:verify ${safe} $tx --no-api true --offline true --as $review
sign $sig --typed @http:json($review typedData)
set $signed @safe:merge($tx $sig)
safe:verify ${safe} $signed --no-api true --offline true --as $signedReview
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
        `load safe\nload http\nsafe:verify ${safe} ${JSON.stringify(pkg)} --no-api true --offline true --as $review\nprint @http:json($review hashes)`,
      )
      .validate();
    expect(result.diagnostics).toEqual([]);
  });
  it("rejects config variables and non-variable output destinations", async () => {
    for (const dest of ["$safe:apiKey", "literal"]) {
      await expect(
        evml
          .with({ transports: { 1: transport } })
          .script(
            `load safe\nsafe:verify ${safe} ${JSON.stringify(pkg)} --no-api true --offline true --as ${dest}`,
          )
          .execute(undefined),
      ).rejects.toThrow();
    }
  });
  it("can select a chain and inspect without wallet or RPC access", async () => {
    await evml
      .with({ transports: { 1: transport } })
      .script(
        `load safe\nswitch 1\nsafe:verify ${safe} ${JSON.stringify(pkg)} --no-api true --offline true --as $report`,
      )
      .execute(undefined);
  });
});
