import type { Profile } from "@forshtat/hegota-support/profiles";
import type { Frame, FrameTx } from "@forshtat/hegota-support/tx";
import type { Address, Hex, Log, TransactionReceipt } from "viem";

export type { Frame, FrameTx, Profile };

/**
 * A frame as the caller writes it. `limits` may be left out on a body frame
 * (one after the validation prefix) of a sender with code: preparing the
 * transaction sizes it through the sidecar's estimate. A sender without code
 * gives every frame its limits, and validation-prefix frames always carry
 * their own: nothing estimates those.
 */
export type FrameRequest = Omit<Frame, "limits"> & {
  limits?: Frame["limits"] | undefined;
};

/** The fields a frame transaction adds to a viem transaction request. */
export interface FrameTransactionRequest {
  type?: "frame" | undefined;
  frames: readonly FrameRequest[];
  /** EIP-8250 nonce keys. Defaults to `[0n]`, the account's ordinary nonce. */
  nonceKeys?: readonly bigint[] | undefined;
  /**
   * The `signer` of the transaction's one secp256k1 signature entry. `"0x"`
   * (the default) for an account without code, which the protocol checks
   * against `tx.sender`.
   */
  signer?: Hex | undefined;
}

/** A prepared frame transaction, as viem hands it to the chain's serializer. */
export interface FrameTransactionSerializable {
  type: "frame";
  chainId: number;
  from: Address;
  /** `nonce_seq`, checked against every key in `nonceKeys`. */
  nonce: number;
  nonceKeys?: readonly bigint[] | undefined;
  frames: readonly Frame[];
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  signer?: Hex | undefined;
}

/** One frame's outcome. `skipped`: a frame of an atomic batch that failed. */
export interface FrameReceipt {
  status: "success" | "reverted" | "skipped";
  gasUsed: bigint;
  stateGasUsed: bigint;
  logs: Log[];
}

/** What a frame transaction's receipt adds to viem's. */
export interface FrameTransactionReceiptFields {
  /** The account that approved payment: the sender, or a paymaster. */
  payer?: Address | undefined;
  /** One entry per frame, in order. */
  frameReceipts?: FrameReceipt[] | undefined;
}

/** viem's receipt, read through `withFrames`' formatter. */
export type FrameTransactionReceipt = TransactionReceipt &
  FrameTransactionReceiptFields;
