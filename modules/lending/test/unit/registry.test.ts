import { describe, it } from "bun:test";
import type { Module } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import {
  ADAPTERS,
  requireRead,
  resolveAdapter,
} from "../../src/adapters/registry";
import type { LendingAdapter } from "../../src/adapters/types";

async function expectRejection(
  method: () => Promise<any> | any,
  messagePart: string,
): Promise<void> {
  let error: Error | null = null;
  try {
    await method();
  } catch (err: any) {
    error = err;
  }
  expect(error, "Exception not thrown").not.to.be.null;
  expect(error!.message).to.include(messagePart);
}

/** Minimal Module stand-in: just what resolveAdapter touches. */
function stubModule(chainId: number, simMode: string | null = null): Module {
  const modules: any[] = simMode ? [{ name: "sim", mode: simMode }] : [];
  return {
    getChainId: async () => chainId,
    context: { modules },
  } as unknown as Module;
}

describe("Lending > adapters > registry", () => {
  it("exposes adapters under lowercased names", () => {
    expect(Object.keys(ADAPTERS)).to.have.members([
      "aavev3",
      "spark",
      "compoundv3",
    ]);
  });

  it("resolves named adapters case-insensitively", async () => {
    const adapter = await resolveAdapter(stubModule(100), "AAVEV3");
    expect(adapter.name).to.eq("AaveV3");
    expect((await resolveAdapter(stubModule(100), "spark")).name).to.eq(
      "Spark",
    );
  });

  it("defaults to AaveV3 where it serves the chain", async () => {
    expect((await resolveAdapter(stubModule(100), undefined)).name).to.eq(
      "AaveV3",
    );
    expect((await resolveAdapter(stubModule(1), undefined)).name).to.eq(
      "AaveV3",
    );
  });

  it("rejects Spark on chains it does not serve", async () => {
    await expectRejection(
      () => resolveAdapter(stubModule(10), "Spark"),
      "Spark is not available on OP Mainnet",
    );
  });

  it("resolves CompoundV3 where deployed and rejects it elsewhere", async () => {
    expect((await resolveAdapter(stubModule(10), "CompoundV3")).name).to.eq(
      "CompoundV3",
    );
    await expectRejection(
      () => resolveAdapter(stubModule(100), "CompoundV3"),
      "CompoundV3 is not available on Gnosis",
    );
  });

  it("stays available under an active sim fork (fully on-chain)", async () => {
    const adapter = await resolveAdapter(stubModule(100, "anvil"), undefined);
    expect(adapter.name).to.eq("AaveV3");
    expect(adapter.kind).to.eq("onchain");
  });

  it("rejects unknown adapters", async () => {
    await expectRejection(
      () => resolveAdapter(stubModule(100), "compound"),
      'unknown lending adapter "compound"',
    );
  });

  it("rejects adapters not deployed on the chain", async () => {
    await expectRejection(
      () => resolveAdapter(stubModule(31337), "AaveV3"),
      "AaveV3 is not available on Anvil",
    );
  });

  it("errors when no adapter covers the chain", async () => {
    await expectRejection(
      () => resolveAdapter(stubModule(31337), undefined),
      "no lending adapter available on Anvil",
    );
  });

  it("requireRead fails clearly when an adapter lacks a read method", async () => {
    const bare = { name: "Bare" } as unknown as LendingAdapter;
    await expectRejection(
      () => requireRead(bare, "healthFactor"),
      "Bare does not expose healthFactor",
    );
    expect(requireRead(ADAPTERS.aavev3, "healthFactor")).to.be.a("function");
  });
});
