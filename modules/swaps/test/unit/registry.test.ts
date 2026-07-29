import { describe, it } from "bun:test";
import type { Module } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { resolveVenue, VENUES } from "../../src/venues/registry";

async function expectRejection(
  method: () => Promise<any>,
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

/** Minimal Module stand-in: just what resolveVenue touches. */
function stubModule(chainId: number, simMode: string | null = null): Module {
  const modules: any[] = simMode ? [{ name: "sim", mode: simMode }] : [];
  return {
    getChainId: async () => chainId,
    context: { modules },
  } as unknown as Module;
}

describe("Swaps > venues > registry", () => {
  it("exposes venues under lowercased names", () => {
    expect(Object.keys(VENUES)).to.have.members([
      "delora",
      "uniswapv4",
      "uniswapv3",
      "uniswapv2",
      "honeyswap",
      "sushiswap",
      "balancer",
      "cowswap",
    ]);
  });

  it("resolves named venues case-insensitively", async () => {
    const venue = await resolveVenue(stubModule(100), "HONEYSWAP");
    expect(venue.name).to.eq("Honeyswap");
  });

  it("defaults to the Delora aggregator where it serves the chain", async () => {
    expect((await resolveVenue(stubModule(100), undefined)).name).to.eq(
      "Delora",
    );
    expect((await resolveVenue(stubModule(1), undefined)).name).to.eq("Delora");
  });

  it("never defaults to intent venues and skips venues without exact-out", async () => {
    // Exact-out: Delora is skipped, Gnosis falls through to Honeyswap.
    expect(
      (await resolveVenue(stubModule(100), undefined, { exactOut: true })).name,
    ).to.eq("Honeyswap");
    await expectRejection(
      () => resolveVenue(stubModule(100), "Delora", { exactOut: true }),
      "does not support exact-output swaps",
    );
  });

  it("rejects unknown venues", async () => {
    await expectRejection(
      () => resolveVenue(stubModule(100), "quantumswap"),
      'unknown swap venue "quantumswap"',
    );
  });

  it("rejects venues not deployed on the chain", async () => {
    await expectRejection(
      () => resolveVenue(stubModule(100), "UniswapV3"),
      "UniswapV3 is not available on chain 100",
    );
  });

  it("skips API venues and picks an on-chain venue under an active sim fork", async () => {
    const venue = await resolveVenue(stubModule(100, "anvil"), undefined);
    expect(venue.name).to.eq("Honeyswap");
    expect(venue.kind).to.eq("onchain");
    // Mainnet under sim falls through Delora to UniswapV4.
    expect((await resolveVenue(stubModule(1, "anvil"), undefined)).name).to.eq(
      "UniswapV4",
    );
  });

  it("rejects explicitly selected off-chain venues under a sim fork", async () => {
    await expectRejection(
      () => resolveVenue(stubModule(100, "anvil"), "Delora"),
      "not deterministic inside a simulation",
    );
    await expectRejection(
      () => resolveVenue(stubModule(100, "anvil"), "CoWSwap"),
      "not deterministic inside a simulation",
    );
  });

  it("errors when no venue covers the chain", async () => {
    await expectRejection(
      () => resolveVenue(stubModule(31337), undefined),
      "no swap venue available on chain 31337",
    );
  });
});
