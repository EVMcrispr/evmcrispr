// A frame transaction's intrinsic gas, as EIP-8141 prices it: what its
// fields cost before any frame runs. Measured against the Hegota devnet's
// maxCost on 2026-11-09 (hegota-post-tx-probe (f)): exact, plus a constant
// the client adds (FrameGasRules.preCharge.intrinsicExtra).
import { type Address, type Hex, isAddressEqual } from "viem";

const FRAME_TX_INTRINSIC_COST = 12_000n;
const FRAME_TX_PER_FRAME_COST = 475n;
const SECP256K1_VERIFICATION = 2_800n;
const TX_VALUE_COST = 6_000n;
const STANDARD_TOKEN_COST = 4n;
/** A secp256k1 signature's bytes, priced as if none were zero: the
 *  signature does not exist yet, and a real one with k zero bytes costs
 *  12·k less. */
const SIGNATURE_BYTES = 65n;

/** Calldata tokens: 1 a zero byte, 4 any other. */
function tokens(data: Hex): bigint {
  let count = 0n;
  for (let i = 2; i < data.length; i += 2)
    count += data.slice(i, i + 2) === "00" ? 1n : 4n;
  return count;
}

export function frameIntrinsicGas(
  frames: readonly { target: Address | null; data: Hex; value: bigint }[],
  sender: Address,
  extra: bigint,
): bigint {
  let gas =
    FRAME_TX_INTRINSIC_COST +
    FRAME_TX_PER_FRAME_COST * BigInt(frames.length) +
    SECP256K1_VERIFICATION +
    STANDARD_TOKEN_COST * 4n * SIGNATURE_BYTES +
    extra;
  for (const f of frames) {
    gas += STANDARD_TOKEN_COST * tokens(f.data);
    if (f.value > 0n && f.target !== null && !isAddressEqual(f.target, sender))
      gas += TX_VALUE_COST;
  }
  return gas;
}
