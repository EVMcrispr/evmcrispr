import { ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { concatHex, hashTypedData, isHex, size, sliceHex, toHex } from "viem";
import { buildOrderTypedData, type CowOrder } from "../venues/lib/cowApi";
import { decodeSchedule } from "./cow";
import type { TwapReference } from "./types";

export function partOrder(
  ref: TwapReference,
  start: bigint,
  index: bigint,
): CowOrder {
  const s = decodeSchedule(ref.params);
  if (index < 0n || index >= s.n || start === 0n)
    throw new ErrorException("Invalid TWAP part index/start");
  const validTo = start + index * s.t + (s.span || s.t) - 1n;
  if (validTo > 0xffffffffn)
    throw new ErrorException("TWAP part expiry exceeds uint32");
  return {
    sellToken: s.sellToken,
    buyToken: s.buyToken,
    receiver: s.receiver,
    sellAmount: s.partSellAmount,
    buyAmount: s.minPartLimit,
    validTo: Number(validTo),
    appData: s.appData,
    feeAmount: 0n,
    kind: "sell",
    partiallyFillable: false,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  };
}

export function partUid(ref: TwapReference, start: bigint, index: bigint): Hex {
  const order = partOrder(ref, start, index);
  return concatHex([
    hashTypedData(JSON.parse(buildOrderTypedData(ref.chainId, order))),
    ref.account,
    toHex(order.validTo, { size: 4 }),
  ]).toLowerCase() as Hex;
}

/** Infer the candidate index from validTo, then verify the entire signed UID. */
export function uidPart(
  ref: TwapReference,
  start: bigint,
  value: unknown,
): bigint | null {
  if (
    typeof value !== "string" ||
    !isHex(value, { strict: true }) ||
    size(value) !== 56 ||
    start === 0n
  )
    return null;
  const s = decodeSchedule(ref.params);
  const delta = BigInt(sliceHex(value, 52)) - start - (s.span || s.t) + 1n;
  if (delta < 0n || delta % s.t !== 0n || delta / s.t >= s.n) return null;
  const index = delta / s.t;
  return partUid(ref, start, index) === value.toLowerCase() ? index : null;
}
