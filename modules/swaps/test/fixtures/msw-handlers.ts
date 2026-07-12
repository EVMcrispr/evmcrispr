import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { toHex, zeroAddress } from "viem";

/** Fake Delora execution target returned by the mocked quotes. */
export const DELORA_TARGET = "0x1111111111111111111111111111111111111111";
export const DELORA_DATA = "0xdeadbeef";
/** Mocked Delora rate: outputAmount = amount * RATE. */
export const DELORA_RATE = 2n;

export const deloraState = {
  requests: [] as Record<string, string>[],
  reset() {
    this.requests = [];
  },
};

export const cowState = {
  quoteRequests: [] as any[],
  orders: [] as any[],
  reset() {
    this.quoteRequests = [];
    this.orders = [];
  },
};

export const COW_MOCK_FEE = 10n ** 15n;
export const COW_MOCK_BUY_AMOUNT = 770000000000000000n;
export const COW_MOCK_SELL_AMOUNT = 130000000000000000000n;
export const COW_MOCK_UID = `0x${"ab".repeat(56)}`;

const ZERO_APP_DATA = `0x${"00".repeat(32)}`;

export const swapServiceHandlers = [
  // Delora aggregator: deterministic 1:2 rate, minOutput derived from the
  // requested slippage exactly like the real API.
  http.get("https://api.delora.build/v1/quotes", ({ request }) => {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    deloraState.requests.push(params);

    const amount = BigInt(params.amount);
    const slippageBps = BigInt(Math.round(Number(params.slippage) * 10000));
    const output = amount * DELORA_RATE;
    const minOutput = output - (output * slippageBps) / 10000n;
    const nativeIn = params.originCurrency === zeroAddress;

    return HttpResponse.json({
      inputAmount: amount.toString(),
      outputAmount: output.toString(),
      minOutputAmount: minOutput.toString(),
      adapter: "TEST",
      calldata: {
        to: DELORA_TARGET,
        data: DELORA_DATA,
        value: nativeIn ? toHex(amount) : "0x00",
      },
      approvalAddress: DELORA_TARGET,
      fees: { total: { amount: "0" }, breakdown: [] },
      warnings: [],
    });
  }),

  // CoW orderbook on Gnosis ("xdai" slug).
  http.post("https://api.cow.fi/xdai/api/v1/quote", async ({ request }) => {
    const body = (await request.json()) as any;
    cowState.quoteRequests.push(body);
    const sell =
      body.kind === "sell"
        ? BigInt(body.sellAmountBeforeFee) - COW_MOCK_FEE
        : COW_MOCK_SELL_AMOUNT;
    const buy =
      body.kind === "sell"
        ? COW_MOCK_BUY_AMOUNT
        : BigInt(body.buyAmountAfterFee);
    return HttpResponse.json({
      quote: {
        sellToken: body.sellToken,
        buyToken: body.buyToken,
        receiver: body.receiver,
        sellAmount: sell.toString(),
        buyAmount: buy.toString(),
        validTo: body.validTo ?? 1900000000,
        appData: ZERO_APP_DATA,
        feeAmount: COW_MOCK_FEE.toString(),
        kind: body.kind,
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
        signingScheme: "eip712",
      },
      from: body.from,
      id: 1,
      verified: true,
    });
  }),
  http.post("https://api.cow.fi/xdai/api/v1/orders", async ({ request }) => {
    cowState.orders.push(await request.json());
    return HttpResponse.json(COW_MOCK_UID, { status: 201 });
  }),
];
