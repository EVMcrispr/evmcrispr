import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  hexToBigInt,
  hexToNumber,
  size,
  slice,
} from "viem";

/**
 * Decoder for LayerZero v2's PacketV1 wire format, carried in the
 * `encodedPayload` field of the endpoint's `PacketSent(bytes,bytes,address)`
 * event. Layout (PacketV1Codec.sol):
 *   version u8 | nonce u64 | srcEid u32 | sender b32 | dstEid u32 |
 *   receiver b32 | guid b32 | message...
 */

export interface LzPacket {
  version: number;
  nonce: bigint;
  srcEid: number;
  sender: Hex; // bytes32
  dstEid: number;
  receiver: Hex; // bytes32
  guid: Hex;
  message: Hex;
}

export function decodePacketSentLog(data: Hex): {
  encodedPayload: Hex;
  options: Hex;
  sendLibrary: Address;
} {
  const [encodedPayload, options, sendLibrary] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }, { type: "address" }],
    data,
  );
  return { encodedPayload, options, sendLibrary };
}

export function decodeLzPacket(payload: Hex): LzPacket {
  return {
    version: hexToNumber(slice(payload, 0, 1)),
    nonce: hexToBigInt(slice(payload, 1, 9)),
    srcEid: hexToNumber(slice(payload, 9, 13)),
    sender: slice(payload, 13, 45),
    dstEid: hexToNumber(slice(payload, 45, 49)),
    receiver: slice(payload, 49, 81),
    guid: slice(payload, 81, 113),
    message: size(payload) > 113 ? slice(payload, 113) : "0x",
  };
}

export function bytes32ToAddress(value: Hex): Address {
  return slice(value, 12, 32) as Address;
}
