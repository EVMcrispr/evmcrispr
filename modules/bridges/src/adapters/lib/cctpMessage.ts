import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  hexToBigInt,
  hexToNumber,
  size,
  slice,
} from "viem";

/**
 * Byte codecs for CCTP v2's MessageV2 / BurnMessageV2 wire formats.
 * Layout reference: circlefin/evm-cctp-contracts (MessageV2.sol,
 * BurnMessageV2.sol).
 */

export interface CctpMessageV2 {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: Hex;
  /** bytes32-padded source TokenMessenger. */
  sender: Hex;
  /** bytes32-padded destination recipient contract (TokenMessenger). */
  recipient: Hex;
  destinationCaller: Hex;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  messageBody: Hex;
}

export interface CctpBurnMessageV2 {
  version: number;
  burnToken: Hex;
  mintRecipient: Hex;
  amount: bigint;
  messageSender: Hex;
  maxFee: bigint;
  feeExecuted: bigint;
}

/** The raw message bytes carried by a `MessageSent(bytes)` event log. */
export function decodeMessageSentLog(data: Hex): Hex {
  const [message] = decodeAbiParameters([{ type: "bytes" }], data);
  return message;
}

export function decodeCctpMessage(message: Hex): CctpMessageV2 {
  return {
    version: hexToNumber(slice(message, 0, 4)),
    sourceDomain: hexToNumber(slice(message, 4, 8)),
    destinationDomain: hexToNumber(slice(message, 8, 12)),
    nonce: slice(message, 12, 44),
    sender: slice(message, 44, 76),
    recipient: slice(message, 76, 108),
    destinationCaller: slice(message, 108, 140),
    minFinalityThreshold: hexToNumber(slice(message, 140, 144)),
    finalityThresholdExecuted: hexToNumber(slice(message, 144, 148)),
    messageBody: size(message) > 148 ? slice(message, 148) : "0x",
  };
}

export function decodeCctpBurnBody(body: Hex): CctpBurnMessageV2 {
  return {
    version: hexToNumber(slice(body, 0, 4)),
    burnToken: slice(body, 4, 36),
    mintRecipient: slice(body, 36, 68),
    amount: hexToBigInt(slice(body, 68, 100)),
    messageSender: slice(body, 100, 132),
    maxFee: hexToBigInt(slice(body, 132, 164)),
    feeExecuted: hexToBigInt(slice(body, 164, 196)),
  };
}

/**
 * Rebuild a MessageV2 with a different nonce and executed finality
 * threshold. CCTP v2 assigns nonces off-chain (the source event carries
 * a zero nonce and finalityThresholdExecuted), so simulated attestations
 * must fill both the way Circle's attester would.
 */
export function patchCctpMessage(
  message: Hex,
  patch: { nonce: Hex; finalityThresholdExecuted: number },
): Hex {
  const head = slice(message, 0, 12); // version + srcDomain + dstDomain
  const middle = slice(message, 44, 144); // sender..minFinalityThreshold
  const body = size(message) > 148 ? slice(message, 148) : ("0x" as Hex);
  const executed = patch.finalityThresholdExecuted
    .toString(16)
    .padStart(8, "0");
  return `0x${head.slice(2)}${patch.nonce.slice(2)}${middle.slice(2)}${executed}${body.slice(2)}` as Hex;
}

/** Right 20 bytes of a bytes32-padded address. */
export function bytes32ToAddress(value: Hex): Address {
  return slice(value, 12, 32) as Address;
}

/** Left-pad an address to bytes32. */
export function addressToBytes32(address: Address): Hex {
  return `0x${address.slice(2).padStart(64, "0")}` as Hex;
}
