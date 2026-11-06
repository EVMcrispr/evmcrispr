import { profile as tracer } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import {
  decodeTx,
  encodeTx,
  newTx,
  secp256k1Placeholder,
} from "@forshtat/hegota-support/tx";
import {
  concat,
  getAddress,
  type Hex,
  numberToHex,
  type SerializeTransactionFn,
  type Signature,
  serializeTransaction,
  type TransactionSerializable,
} from "viem";
import type { FrameTransactionSerializable, FrameTx, Profile } from "./types";

export function isFrameTransaction(
  tx: unknown,
): tx is FrameTransactionSerializable {
  return (
    typeof tx === "object" &&
    tx !== null &&
    ((tx as { type?: unknown }).type === "frame" || "frames" in tx)
  );
}

/** The library's transaction for a prepared viem request, with its signature entry left empty. */
export function toFrameTx(
  tx: FrameTransactionSerializable,
  profile: Profile = tracer,
): FrameTx {
  return newTx({
    chainId: tx.chainId,
    sender: tx.from,
    nonceSeq: BigInt(tx.nonce),
    nonceKeys: tx.nonceKeys ? [...tx.nonceKeys] : undefined,
    frames: [...tx.frames],
    signatures: [secp256k1Placeholder(profile, tx.signer ?? "0x")],
    fees: {
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    },
  });
}

/** `v || r || s` with `v` a bare recovery id (0 or 1), the form these devnets accept. */
function packSecp256k1(signature: Signature): Hex {
  const parity = signature.yParity ?? Number(signature.v) - 27;
  return concat([numberToHex(parity, { size: 1 }), signature.r, signature.s]);
}

/**
 * `0x06 || rlp(payload)`. Without a signature the signature bytes are empty,
 * which is exactly the encoding the signature hash is taken over. That is what
 * lets viem's own local-account signing (`keccak256(serializer(tx))`, then
 * `serializer(tx, signature)`) produce a valid frame transaction.
 */
export function serializeFrameTransaction(
  tx: FrameTransactionSerializable,
  signature?: Signature,
  profile: Profile = tracer,
): Hex {
  const frameTx = toFrameTx(tx, profile);
  if (signature) {
    const [entry] = frameTx.signatures;
    frameTx.signatures = [{ ...entry!, signature: packSecp256k1(signature) }];
  }
  return encodeTx(profile, frameTx);
}

/** Inverse of `serializeFrameTransaction`, in the library's form. */
export function parseFrameTransaction(
  raw: Hex,
  profile: Profile = tracer,
): FrameTx {
  const tx = decodeTx(profile, raw);
  // Checksummed, as viem returns addresses.
  return {
    ...tx,
    sender: getAddress(tx.sender),
    frames: tx.frames.map((f) => ({
      ...f,
      target: f.target && getAddress(f.target),
    })),
  };
}

/** A chain serializer: frame transactions through the profile, everything else through viem. */
export function frameSerializer(
  profile: Profile = tracer,
): SerializeTransactionFn {
  return ((
    tx: TransactionSerializable | FrameTransactionSerializable,
    signature?: Signature,
  ) =>
    isFrameTransaction(tx)
      ? serializeFrameTransaction(tx, signature, profile)
      : serializeTransaction(
          tx as TransactionSerializable,
          signature,
        )) as SerializeTransactionFn;
}
