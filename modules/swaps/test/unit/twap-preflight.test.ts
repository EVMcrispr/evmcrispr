import "../setup";
import { afterEach, describe, expect, it } from "bun:test";
import type { Module } from "@evmcrispr/sdk";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { zeroHash } from "viem";
import { cowJson, orderbookOrders } from "../../src/twap/api";
import { TWAP_CREATION_CHAINS, TWAP_NETWORKS } from "../../src/twap/networks";
import {
  protectedMinimum,
  protectionBps,
  twapPreflight,
  validateQuote,
} from "../../src/twap/preflight";
import { resolveTwap } from "../../src/twap/registry";
import type { TwapSchedule } from "../../src/twap/types";
import { GNO, SOME_ADDRESS, WXDAI } from "../fixtures";
import { cowState } from "../fixtures/msw-handlers";
import { server } from "../setup";

const schedule: TwapSchedule = {
  sellToken: WXDAI,
  buyToken: GNO,
  receiver: SOME_ADDRESS,
  partSellAmount: 12n * 10n ** 18n,
  minPartLimit: 1n,
  t0: 0n,
  n: 3n,
  t: 3600n,
  span: 0n,
  appData: zeroHash,
};
const validTo = 1900000000;
const response = () => ({
  verified: true,
  expiration: new Date(Date.now() + 60000).toISOString(),
  from: SOME_ADDRESS,
  quote: {
    sellToken: WXDAI,
    buyToken: GNO,
    receiver: SOME_ADDRESS,
    sellAmount: (schedule.partSellAmount - 10n).toString(),
    feeAmount: "10",
    buyAmount: "101",
    validTo,
    appData: zeroHash,
    kind: "sell",
    partiallyFillable: false,
    signingScheme: "eip1271",
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  },
});
afterEach(() => server.resetHandlers());

describe("TWAP > live preflight", () => {
  it("uses exact basis points and rounds the per-part minimum upward", () => {
    expect(protectionBps("99.99")).toBe(9999n);
    expect(protectionBps("0.01")).toBe(1n);
    expect(protectedMinimum(101n, protectionBps("10"))).toBe(91n);
    expect(protectedMinimum(101n, 0n)).toBe(101n);
    expect(protectedMinimum(1n, 9999n)).toBe(1n);
    for (const n of ["0.001", "100", "-1", "oops"])
      expect(() => protectionBps(n)).toThrow();
  });

  it.each([
    ["unverified", { verified: false }],
    ["missing expiry", { expiration: undefined }],
    ["expired", { expiration: "2000-01-01T00:00:00Z" }],
    ["wrong owner", { from: GNO }],
    ["missing owner", { from: undefined }],
  ])("rejects %s quotes", (_name, changes) => {
    expect(() =>
      validateQuote(
        { ...response(), ...changes },
        schedule,
        SOME_ADDRESS,
        validTo,
      ),
    ).toThrow();
  });
  it.each([
    ["token", { sellToken: GNO }],
    ["recipient", { receiver: WXDAI }],
    ["kind", { kind: "buy" }],
    ["partial fill", { partiallyFillable: true }],
    ["scheme", { signingScheme: "eip712" }],
    ["expiry", { validTo: 42 }],
    ["appData", { appData: "0x" }],
    ["balance", { sellTokenBalance: "internal" }],
    ["fee coverage", { sellAmount: "0" }],
    ["total", { feeAmount: "11" }],
    ["fraction", { buyAmount: "0.1" }],
    ["negative", { feeAmount: "-1" }],
    ["overflow", { buyAmount: (1n << 256n).toString() }],
  ])("rejects mismatched %s", (_name, changes) => {
    const data = response();
    data.quote = { ...data.quote, ...changes } as typeof data.quote;
    expect(() =>
      validateQuote(data, schedule, SOME_ADDRESS, validTo),
    ).toThrow();
  });

  it("matches SDK fee accounting: net output already includes network and protocol fees", () => {
    const quote = validateQuote(
      { ...response(), protocolFeeBps: 100 },
      schedule,
      SOME_ADDRESS,
      validTo,
    );
    expect(quote.netBuy).toBe(101n);
    expect(quote.fee).toBe(10n);
    expect(quote.protocolFeeInBuy).toBe(1n);
    expect(protectedMinimum(quote.netBuy, 1000n)).toBe(91n);
    expect(() =>
      validateQuote(
        { ...response(), protocolFeeBps: "10000" },
        schedule,
        SOME_ADDRESS,
        validTo,
      ),
    ).toThrow();
  });

  it("quotes one part for the Safe and checks its notional with atom-based prices", async () => {
    cowState.reset();
    const result = await twapPreflight(
      100,
      schedule,
      SOME_ADDRESS,
      1800000000n,
    );
    expect(result.notionalUsdc).toBe("12");
    expect(cowState.quoteRequests[0]).toMatchObject({
      from: SOME_ADDRESS,
      receiver: SOME_ADDRESS,
      signingScheme: "eip1271",
      priceQuality: "verified",
      onchainOrder: false,
      sellAmountBeforeFee: schedule.partSellAmount.toString(),
      validTo: 1800001200,
    });
    await expect(
      twapPreflight(100, { ...schedule, t: 299n }, SOME_ADDRESS, 1800000000n),
    ).rejects.toThrow("300");
    await expect(
      twapPreflight(
        100,
        { ...schedule, partSellAmount: 10n ** 17n },
        SOME_ADDRESS,
        1800000000n,
      ),
    ).rejects.toThrow("minimum");
  });

  it.each([400, 403, 404, 429, 500])(
    "fails closed on quote HTTP %s",
    async (status) => {
      server.use(
        http.post(
          "https://api.cow.fi/xdai/api/v1/quote",
          () => new HttpResponse(null, { status }),
        ),
      );
      await expect(
        twapPreflight(100, schedule, SOME_ADDRESS, 1800000000n),
      ).rejects.toThrow(`HTTP ${status}`);
    },
  );

  it("fails closed on unavailable valuations or indexer service", async () => {
    server.use(
      http.get("https://api.cow.fi/xdai/api/v1/token/:token/native_price", () =>
        HttpResponse.json({ price: 0 }),
      ),
    );
    await expect(
      twapPreflight(100, schedule, SOME_ADDRESS, 1800000000n),
    ).rejects.toThrow("positive");
    server.resetHandlers();
    server.use(
      http.post("https://programmatic-orders.cow.fi/graphql", () =>
        HttpResponse.json({ errors: [{ message: "unavailable" }] }),
      ),
    );
    await expect(
      twapPreflight(100, schedule, SOME_ADDRESS, 1800000000n),
    ).rejects.toThrow("indexer");
  });

  it("keeps management available when creation is disabled", async () => {
    const module = { getChainId: async () => 137 } as Module;
    TWAP_CREATION_CHAINS.delete(137);
    try {
      expect((await resolveTwap(module)).name).toBe("CoWSwap");
      await expect(resolveTwap(module, "CoWSwap", true)).rejects.toThrow(
        "service support",
      );
    } finally {
      TWAP_CREATION_CHAINS.add(137);
    }
    expect(TWAP_NETWORKS[1].minimumUsdc).toBe(1000_000000n);
  });

  it("bounds API response bodies and lookup batches", async () => {
    server.use(
      http.get(
        "https://api.cow.fi/xdai/api/v1/large",
        () => new HttpResponse("x".repeat(2_000_001)),
      ),
    );
    await expect(
      cowJson("https://api.cow.fi/xdai/api/v1/large"),
    ).rejects.toThrow("too large");
    await expect(
      orderbookOrders(100, Array(129).fill(zeroHash)),
    ).rejects.toThrow("128");
  });
});
