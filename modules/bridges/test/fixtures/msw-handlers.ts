import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";

/**
 * Mocks for the off-chain services the bridge adapters talk to: Across's
 * suggested-fees/deposit-status API, Circle's Iris attestation service and
 * LayerZero Scan.
 */

/** Across charges 1/1000 of the input in the mocks. */
export const ACROSS_MOCK_FEE_DIVISOR = 1000n;

export const acrossState = {
  /** Deposit statuses keyed by depositId. */
  statuses: {} as Record<string, string>,
  requests: [] as Record<string, string>[],
  reset() {
    this.statuses = {};
    this.requests = [];
  },
};

export const irisState = {
  /** Messages keyed by source-domain + tx hash; empty = 404. */
  messages: [] as {
    status: string;
    message: string;
    attestation: string | null;
  }[],
  reset() {
    this.messages = [];
  },
};

export const lzState = {
  status: undefined as string | undefined,
  reset() {
    this.status = undefined;
  },
};

export const bridgeServiceHandlers = [
  http.get("https://app.across.to/api/suggested-fees", ({ request }) => {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    acrossState.requests.push(params);

    const amount = BigInt(params.amount ?? "0");
    const fee = amount / ACROSS_MOCK_FEE_DIVISOR;
    const timestamp = 1_700_000_000;

    return HttpResponse.json({
      totalRelayFee: { pct: "1000000000000000", total: fee.toString() },
      timestamp: String(timestamp),
      fillDeadline: String(timestamp + 4 * 3600),
      exclusiveRelayer: "0x0000000000000000000000000000000000000000",
      exclusivityDeadline: "0",
      outputToken: params.outputToken,
      outputAmount: (amount - fee).toString(),
    });
  }),

  http.get("https://app.across.to/api/deposit/status", ({ request }) => {
    const url = new URL(request.url);
    const depositId = url.searchParams.get("depositId") ?? "";
    return HttpResponse.json({
      status: acrossState.statuses[depositId] ?? "pending",
    });
  }),

  http.get("https://iris-api.circle.com/v2/messages/:domain", () => {
    if (irisState.messages.length === 0) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ messages: irisState.messages });
  }),

  http.get("https://scan.layerzero-api.com/v1/messages/tx/:hash", () => {
    if (!lzState.status) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({
      data: [{ status: { name: lzState.status } }],
    });
  }),
];
