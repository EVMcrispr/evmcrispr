import type { Hex } from "viem";
import { isHex, stringToHex } from "viem";

/** Encode a proposal metadata option (URI or raw hex) as bytes. */
export function toMetadataBytes(raw?: string): Hex {
  if (!raw) return "0x";
  if (isHex(raw)) return raw;
  return stringToHex(raw);
}
