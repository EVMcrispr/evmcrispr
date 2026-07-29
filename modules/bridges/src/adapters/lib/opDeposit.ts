import type { Address, Hex } from "viem";
import { hexToBigInt, hexToNumber, size, slice } from "viem";

/**
 * Codec for the OptimismPortal's `TransactionDeposited` opaqueData blob:
 *   mint u256 | value u256 | gasLimit u64 | isCreation u8 | data...
 * (see OptimismPortal.depositTransaction / Types.UserDepositTransaction)
 */
export interface OpDeposit {
  mint: bigint;
  value: bigint;
  gasLimit: bigint;
  isCreation: boolean;
  data: Hex;
}

export function decodeOpaqueData(opaqueData: Hex): OpDeposit {
  return {
    mint: hexToBigInt(slice(opaqueData, 0, 32)),
    value: hexToBigInt(slice(opaqueData, 32, 64)),
    gasLimit: hexToBigInt(slice(opaqueData, 64, 72)),
    isCreation: hexToNumber(slice(opaqueData, 72, 73)) === 1,
    data: size(opaqueData) > 73 ? slice(opaqueData, 73) : "0x",
  };
}

/** Right 20 bytes of a bytes32-padded address (indexed event topics). */
export function topicToAddress(topic: Hex): Address {
  return `0x${topic.slice(26)}` as Address;
}
