import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Address } from "../../src/types";
import {
  clearTokenHoldingsCache,
  fetchTokenHoldings,
} from "../../src/utils/token-holdings";

// `fetchTokenHoldings` answers three different things, and a caller that
// declares "this chain has no explorer" must be able to tell them apart:
// `null` only when the chain has no configured explorer, `[]` for an
// address that genuinely holds nothing, and a thrown error for every
// transport, HTTP or payload failure — an outage is not a missing explorer.

const HOLDER = "0x1111111111111111111111111111111111111111" as Address;
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const GNO = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb";
const GNOSIS = 100;
const NO_EXPLORER = 56; // BNB Smart Chain: no Blockscout host is configured.

const holding = (
  address: string,
  value: string,
  token: Record<string, unknown> = {},
) => ({
  token: {
    address_hash: address,
    symbol: "TKN",
    decimals: "18",
    type: "ERC-20",
    ...token,
  },
  value,
});

const realFetch = globalThis.fetch;
let requests: string[] = [];

/** Stub the explorer with one handler, recording every request. */
const serve = (handler: (url: string) => Response | Promise<Response>) => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    requests.push(url);
    return handler(url);
  }) as typeof fetch;
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

beforeEach(() => {
  requests = [];
  clearTokenHoldingsCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearTokenHoldingsCache();
});

describe("fetchTokenHoldings", () => {
  it("returns null for a chain with no configured explorer, without asking", async () => {
    serve(() => json([]));
    expect(await fetchTokenHoldings(NO_EXPLORER, HOLDER)).toBe(null);
    expect(requests).toEqual([]);
  });

  it("returns the fungible holdings, checksummed, in the explorer's order", async () => {
    serve(() =>
      json([
        holding(WXDAI.toLowerCase(), "1500000000000000000000"),
        holding(GNO, "42000000000000000000", { decimals: null }),
      ]),
    );
    expect(
      await fetchTokenHoldings(GNOSIS, HOLDER.toUpperCase() as Address),
    ).toEqual([
      {
        token: WXDAI,
        symbol: "TKN",
        decimals: 18,
        balance: 1500000000000000000000n,
      },
      {
        token: GNO,
        symbol: "TKN",
        decimals: undefined,
        balance: 42000000000000000000n,
      },
    ]);
    expect(requests).toEqual([
      `https://gnosis.blockscout.com/api/v2/addresses/${HOLDER}/token-balances`,
    ]);
  });

  it("drops the entries no swap or transfer could spend", async () => {
    serve(() =>
      json([
        holding(GNO, "1", { type: "ERC-721" }),
        holding(WXDAI, "0"),
        holding("not-an-address", "1"),
        holding(GNO, "1.5"),
        { token: { symbol: "no address" }, value: "5" },
        holding(WXDAI, "7"),
      ]),
    );
    expect(await fetchTokenHoldings(GNOSIS, HOLDER)).toEqual([
      { token: WXDAI, symbol: "TKN", decimals: 18, balance: 7n },
    ]);
  });

  it("returns an empty array for an address holding no ERC-20", async () => {
    serve(() => json([]));
    expect(await fetchTokenHoldings(GNOSIS, HOLDER)).toEqual([]);
  });

  it("throws on a non-OK response instead of reporting no explorer", async () => {
    serve(() => json({ message: "Not found" }, { status: 404 }));
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(
      /gnosis\.blockscout\.com.*404/,
    );

    clearTokenHoldingsCache();
    serve(() => json({ message: "boom" }, { status: 500 }));
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(/500/);
  });

  it("throws when the request itself fails", async () => {
    serve(() => {
      throw new TypeError("Unable to connect");
    });
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(
      /gnosis\.blockscout\.com.*Unable to connect/,
    );
  });

  it("throws on a malformed payload instead of reporting no explorer", async () => {
    serve(() => json({ items: [] }));
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(
      /gnosis\.blockscout\.com/,
    );

    clearTokenHoldingsCache();
    serve(
      () =>
        new Response("<html>gateway</html>", {
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(
      /gnosis\.blockscout\.com/,
    );
  });

  it("caches a successful result, including an empty one", async () => {
    serve(() => json([holding(WXDAI, "7")]));
    const first = await fetchTokenHoldings(GNOSIS, HOLDER);
    expect(await fetchTokenHoldings(GNOSIS, HOLDER)).toEqual(first!);
    expect(requests.length).toBe(1);

    serve(() => json([]));
    const other = "0x2222222222222222222222222222222222222222" as Address;
    expect(await fetchTokenHoldings(GNOSIS, other)).toEqual([]);
    expect(await fetchTokenHoldings(GNOSIS, other)).toEqual([]);
    expect(requests.length).toBe(2);
  });

  it("caches the no-explorer answer without a request", async () => {
    serve(() => json([]));
    expect(await fetchTokenHoldings(NO_EXPLORER, HOLDER)).toBe(null);
    expect(await fetchTokenHoldings(NO_EXPLORER, HOLDER)).toBe(null);
    expect(requests).toEqual([]);
  });

  it("never caches an outage as a result", async () => {
    serve(() => json({ message: "boom" }, { status: 502 }));
    await expect(fetchTokenHoldings(GNOSIS, HOLDER)).rejects.toThrow(/502/);

    serve(() => json([holding(WXDAI, "7")]));
    expect(await fetchTokenHoldings(GNOSIS, HOLDER)).toEqual([
      { token: WXDAI, symbol: "TKN", decimals: 18, balance: 7n },
    ]);
    expect(requests.length).toBe(2);
  });
});
