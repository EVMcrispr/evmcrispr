import { describe, it } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { custom } from "viem";
import { gnosis } from "viem/chains";
import { createEvml } from "../../../src/evml/tag";

describe("evml > script", () => {
  it("parses lazily and caches the AST", () => {
    const evml = createEvml();
    const script = evml`set $x 1`;
    const first = script.ast;
    expect(script.ast).to.equal(first);
  });

  it("reports parse problems via diagnostics without throwing", () => {
    const evml = createEvml();
    const script = evml.script("(");
    expect(script.diagnostics.length).to.be.greaterThan(0);
  });

  it("interprets with fresh state per run", async () => {
    const evml = createEvml();
    const script = evml`set $x 1
print $x`;
    const logsA: string[] = [];
    const logsB: string[] = [];
    await evml
      .with({ onLog: (m) => logsA.push(m) })
      .script(script.source)
      .interpret();
    await evml
      .with({ onLog: (m) => logsB.push(m) })
      .script(script.source)
      .interpret();
    expect(logsA).to.eql(["1"]);
    expect(logsB).to.eql(["1"]);
  });

  it("supports the onAction escape hatch", async () => {
    // The callback receives the action without sending it, so the only
    // RPC involved is `eth_chainId` for chain-id stamping — a fake
    // transport keeps this test independent of the shared anvil (which
    // occasionally refuses connections under parallel turbo load).
    const fakeTransport = custom({
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return `0x${gnosis.id.toString(16)}`;
        throw new Error(`unexpected RPC call: ${method}`);
      },
    });
    const evml = createEvml().with({
      account: TEST_ACCOUNT_ADDRESS as `0x${string}`,
      chainId: gnosis.id,
      transports: { [gnosis.id]: fakeTransport },
    });
    const seen: Action[] = [];
    const script = evml`exec 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 transfer(address,uint256) 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3 1`;
    await script.interpret({
      onAction: async (action) => {
        seen.push(action);
      },
    });
    expect(seen).to.have.lengthOf(1);
    expect(isTransactionAction(seen[0])).to.be.true;
  });

  it("simulate() fails fast when sim is not registered", async () => {
    const evml = createEvml();
    const script = evml`set $x 1`;
    try {
      await script.simulate();
      throw new Error("expected to throw");
    } catch (err: any) {
      expect(err.message).to.include("evml.use(sim)");
    }
  });
});
