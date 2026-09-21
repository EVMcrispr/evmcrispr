import { ErrorException } from "@evmcrispr/sdk";
import { isAddress, isHex, size } from "viem";
import { decodeSchedule, orderHash, TWAP_CHAINS } from "./cow";
import type { TwapReference } from "./types";

export function parseReference(value: unknown): TwapReference {
  try {
    if (typeof value !== "string") throw new Error();
    const ref = JSON.parse(value) as TwapReference;
    if (
      ref.version !== 1 ||
      ref.provider !== "CoWSwap" ||
      !TWAP_CHAINS.has(ref.chainId) ||
      !Number.isSafeInteger(ref.slot) ||
      ref.slot < 0 ||
      !isAddress(ref.controller) ||
      !isAddress(ref.account) ||
      !isHex(ref.params.salt, { strict: true }) ||
      size(ref.params.salt) !== 32 ||
      !isHex(ref.params.staticInput, { strict: true }) ||
      orderHash(ref.params).toLowerCase() !== ref.orderHash.toLowerCase()
    )
      throw new Error();
    decodeSchedule(ref.params);
    return { ...ref, orderHash: orderHash(ref.params) };
  } catch {
    throw new ErrorException(
      "Invalid TWAP reference; pass the JSON string bound by swaps:twap",
    );
  }
}
