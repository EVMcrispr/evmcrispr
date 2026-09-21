import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { isAddress, isAddressEqual, maxUint256 } from "viem";
import { cowJson, indexedOrders, orderbookUrl, record } from "./api";
import { MIN_PART_INTERVAL, TWAP_NETWORKS } from "./networks";
import type { TwapSchedule } from "./types";

export function protectionBps(value: unknown): bigint {
  let bps: Num;
  try {
    bps = Num(value).mul(Num(100n));
  } catch {
    throw new ErrorException("--price-protection must be an exact percentage");
  }
  if (!bps.isInteger() || bps.lt(Num(0n)) || bps.gt(Num(9999n)))
    throw new ErrorException(
      "--price-protection must be 0 to 99.99 percent in exact basis points",
    );
  return bps.toBigInt();
}

export const protectedMinimum = (buy: bigint, bps: bigint): bigint =>
  (buy * (10000n - bps) + 9999n) / 10000n;

function amount(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value))
    throw new ErrorException("Invalid CoW quote amount");
  const n = BigInt(value);
  if (n > maxUint256)
    throw new ErrorException("CoW quote amount exceeds uint256");
  return n;
}

const addressEquals = (value: unknown, expected: Address) =>
  typeof value === "string" &&
  isAddress(value, { strict: false }) &&
  isAddressEqual(value, expected);

export function validateQuote(
  value: unknown,
  schedule: TwapSchedule,
  owner: Address,
  validTo: number,
  now = Date.now(),
) {
  const result = record(value);
  const quote = record(result.quote);
  const expiration =
    typeof result.expiration === "string" ? Date.parse(result.expiration) : NaN;
  if (!Number.isFinite(expiration) || expiration <= now)
    throw new ErrorException(
      "CoW TWAP quote is expired or has no valid expiration",
    );
  if (result.verified !== true)
    throw new ErrorException("CoW TWAP quote was not verified");
  if (
    !addressEquals(quote.sellToken, schedule.sellToken) ||
    !addressEquals(quote.buyToken, schedule.buyToken) ||
    !addressEquals(quote.receiver, schedule.receiver) ||
    !addressEquals(result.from, owner) ||
    quote.kind !== "sell" ||
    quote.partiallyFillable !== false ||
    quote.sellTokenBalance !== "erc20" ||
    quote.buyTokenBalance !== "erc20" ||
    quote.signingScheme !== "eip1271" ||
    quote.validTo !== validTo ||
    quote.appData !== schedule.appData
  )
    throw new ErrorException(
      "CoW TWAP quote does not match the requested order",
    );
  const sell = amount(quote.sellAmount);
  const fee = amount(quote.feeAmount);
  const buy = amount(quote.buyAmount);
  if (!sell || !buy || sell + fee !== schedule.partSellAmount)
    throw new ErrorException(
      "CoW TWAP quote has invalid amounts or insufficient fee coverage",
    );
  const protocolFeeBps = Num(result.protocolFeeBps ?? 0);
  if (protocolFeeBps.lt(Num(0n)) || protocolFeeBps.gte(Num(10000n)))
    throw new ErrorException("Invalid CoW protocol fee");
  // Pinned SDK getQuoteAmountsAndCosts: /quote buyAmount already includes
  // network costs and protocol fees. Deducting protocolFeeBps again would
  // silently weaken the user's limit. Reconstruct fees only for reporting.
  const protocolFeeInBuy = Num(buy)
    .mul(protocolFeeBps)
    .div(Num(10000n).sub(protocolFeeBps))
    .floorBigInt();
  return {
    netBuy: buy,
    fee,
    protocolFeeBps,
    protocolFeeInBuy,
    expiration,
    quotedAt: new Date(now).toISOString(),
  };
}

async function nativePrice(chainId: number, token: Address): Promise<Num> {
  const response = record(
    await cowJson(
      `${orderbookUrl(chainId)}/api/v1/token/${token}/native_price`,
    ),
  );
  if (typeof response.price !== "string" && typeof response.price !== "number")
    throw new ErrorException("CoW token valuation is unavailable");
  const price = Num(response.price);
  if (price.lte(Num(0n)))
    throw new ErrorException("CoW token valuation must be positive");
  return price;
}

export async function twapPreflight(
  chainId: number,
  schedule: TwapSchedule,
  owner: Address,
  timestamp: bigint,
) {
  if (schedule.t < MIN_PART_INTERVAL)
    throw new ErrorException(
      "Online TWAP validation requires --every of at least 300 seconds; use --offline with --min for custom schedules",
    );
  const network = TWAP_NETWORKS[chainId];
  const window = schedule.span || schedule.t;
  const validTo = Number(timestamp + (window > 1200n ? 1200n : window));
  // Quote today's market, even for a future fixed start. This is not a promise
  // that these prices, fees, or account balances persist until registration.
  const result = await cowJson(`${orderbookUrl(chainId)}/api/v1/quote`, {
    sellToken: schedule.sellToken,
    buyToken: schedule.buyToken,
    receiver: schedule.receiver,
    from: owner,
    kind: "sell",
    sellAmountBeforeFee: schedule.partSellAmount.toString(),
    validTo,
    signingScheme: "eip1271",
    onchainOrder: false,
    priceQuality: "verified",
    appData: schedule.appData,
  });
  const quote = validateQuote(result, schedule, owner, validTo);
  const [sellPrice, usdcPrice] = await Promise.all([
    nativePrice(chainId, schedule.sellToken),
    nativePrice(chainId, network.usdc),
    indexedOrders(chainId, owner),
  ]);
  // native_price is native atoms per token atom, so decimals cancel. All
  // reference USDC contracts in the support manifest use six decimals.
  const usdc = Num(schedule.partSellAmount).mul(sellPrice).div(usdcPrice);
  if (usdc.lt(Num(network.minimumUsdc)))
    throw new ErrorException(
      `TWAP part is below the ${network.minimumUsdc / 1000000n} USDC-equivalent minimum`,
    );
  if (quote.expiration <= Date.now())
    throw new ErrorException("CoW TWAP quote expired during validation");
  return { ...quote, notionalUsdc: usdc.div(Num(1000000n)).toString() };
}
