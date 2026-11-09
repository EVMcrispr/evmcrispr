// A frame transaction's gas before any frame runs, as EIP-8141 prices it:
// its intrinsic gas, and the calldata floor its gas used never falls below.
// Measured against the Hegota devnet on 2026-11-09 (hegota-post-tx-probe
// (f), (h), (i), (j)): exact, with a few bytes the client counts on top of
// the transaction's (FrameGasRules.preCharge.extraBytes).
import { type Address, type Hex, isAddressEqual } from "viem";

const FRAME_TX_INTRINSIC_COST = 12_000n;
const FRAME_TX_PER_FRAME_COST = 475n;
/** What the protocol charges to verify the signature entry: a plain
 *  sender's secp256k1 one, or a frame account's ARBITRARY one (its code
 *  checks it; measured on the Hegota devnet, hegota-post-tx-probe (h)). */
const VERIFICATION = { secp256k1: 2_800n, arbitrary: 100n } as const;
const TX_VALUE_COST = 6_000n;
const STANDARD_TOKEN_COST = 4n;
/** The floor prices every byte as 4 tokens at 16 gas each (EIP-7976). */
const FLOOR_GAS_PER_BYTE = 64n;
/** The signature's 65 bytes, priced as if none were zero (the Hegota devnet
 *  prices them as they are, zeros at 4): the signature does not exist yet,
 *  and a real one with k zero bytes costs 12·k less. A frame account's
 *  (r || s || v, v 27 or 28) has a zero byte only in r or s. */
const SIGNATURE_BYTES = 65n;

/** Calldata tokens: 1 a zero byte, 4 any other. */
function tokens(data: Hex): bigint {
  let count = 0n;
  for (let i = 2; i < data.length; i += 2)
    count += data.slice(i, i + 2) === "00" ? 1n : 4n;
  return count;
}

export interface FrameTxGas {
  /** Charged before any frame runs (and in the maximum cost). */
  intrinsic: bigint;
  /** The least the transaction's gas used can be, whatever its frames use. */
  floor: bigint;
}

/** `extraBytes`: bytes the client counts on top of the transaction's, as
 *  non-zero ones; `scheme`: the signature entry the send carries. */
export function frameTxGas(
  frames: readonly { target: Address | null; data: Hex; value: bigint }[],
  sender: Address,
  extraBytes: bigint,
  scheme: keyof typeof VERIFICATION,
): FrameTxGas {
  let base =
    FRAME_TX_INTRINSIC_COST +
    FRAME_TX_PER_FRAME_COST * BigInt(frames.length) +
    VERIFICATION[scheme];
  let dataTokens = 4n * (SIGNATURE_BYTES + extraBytes);
  let bytes = SIGNATURE_BYTES + extraBytes;
  for (const f of frames) {
    dataTokens += tokens(f.data);
    bytes += BigInt((f.data.length - 2) / 2);
    if (f.value > 0n && f.target !== null && !isAddressEqual(f.target, sender))
      base += TX_VALUE_COST;
  }
  return {
    intrinsic: base + STANDARD_TOKEN_COST * dataTokens,
    floor: base + FLOOR_GAS_PER_BYTE * bytes,
  };
}
