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
      "uniswapv3",
      "uniswapv2",
      "honeyswap",
      "sushiswap",
    ]);
  });

  it("resolves named venues case-insensitively", async () => {
    const venue = await resolveVenue(stubModule(100), "HONEYSWAP");
    expect(venue.name).to.eq("Honeyswap");
  });

  it("defaults to the first supported venue in preference order", async () => {
    // Gnosis: UniswapV3/V2 unsupported, Honeyswap comes before SushiSwap.
    expect((await resolveVenue(stubModule(100), undefined)).name).to.eq(
      "Honeyswap",
    );
    // Mainnet: UniswapV3 leads.
    expect((await resolveVenue(stubModule(1), undefined)).name).to.eq(
      "UniswapV3",
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

  it("still resolves on-chain venues under an active sim fork", async () => {
    const venue = await resolveVenue(stubModule(100, "anvil"), undefined);
    expect(venue.kind).to.eq("onchain");
  });

  it("errors when no venue covers the chain", async () => {
    await expectRejection(
      () => resolveVenue(stubModule(31337), undefined),
      "no swap venue available on chain 31337",
    );
  });
});
