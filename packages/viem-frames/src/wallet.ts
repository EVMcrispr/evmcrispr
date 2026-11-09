// A frame transaction whose sender is an account without code, signed by
// that account's wallet through the standard `eth_signTransaction`, with a
// type 0x06 request. A wallet that implements EIP-8141 signs it as it signs
// any other type; one that does not refuses, with its own error.

import { profile as tracer } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import {
  decodeTx,
  encodeTx,
  newTx,
  secp256k1Placeholder,
  sigHash,
} from "@forshtat/hegota-support/tx";
import {
  type Address,
  type Chain,
  type Hash,
  type Hex,
  hexToBigInt,
  hexToNumber,
  isAddress,
  isAddressEqual,
  isHex,
  numberToHex,
  recoverAddress,
  size,
  slice,
  type Transport,
  type WalletClient,
} from "viem";
import { altMempoolDevnet, frameProfileOf, frameSidecarOf } from "./chain";
import type { FrameSpecLike } from "./frame-specs";
import { printable } from "./printable";
import {
  type FrameLogLevel,
  frameClient,
  framesWithLimits,
  logFees,
  readFees,
  readNonce,
  refusalText,
  submitFrameTransaction,
} from "./send";
import type { FrameTransactionReceipt, FrameTx, Profile } from "./types";

/** Wallet text in an error: escaped and cut. */
const TEXT_MAX = 300;

/** secp256k1's group order: a canonical signature has `s <= N / 2`. */
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** One frame of an `eth_signTransaction` request, quantities as 0x-hex. */
export interface FrameRpcRequest {
  mode: Hex;
  flags: Hex;
  /** `null`: the transaction's sender. */
  target: Address | null;
  gasLimit: Hex;
  stateGasLimit: Hex;
  value: Hex;
  data: Hex;
}

/** The `eth_signTransaction` request for a type 0x06 transaction. */
export interface FrameTransactionRpcRequest {
  type: Hex;
  chainId: Hex;
  /** The transaction's sender: the wallet's account. */
  from: Address;
  nonce: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  frames: FrameRpcRequest[];
}

/** The wallet refused, or failed, to sign: its own text is in `message`. */
export class FrameWalletError extends Error {
  override name = "FrameWalletError";
}

/**
 * The request a wallet is asked to sign for `tx`: the whole transaction, as
 * it will be sent. Only the sender's ordinary nonce (key 0) can be asked.
 */
export function formatFrameTransactionRequest(
  tx: FrameTx,
  profile: Profile = tracer,
): FrameTransactionRpcRequest {
  if (tx.nonceKeys.length !== 1 || tx.nonceKeys[0] !== 0n)
    throw new Error(
      "Only the sender's ordinary nonce (key 0) can be asked of a wallet",
    );
  return {
    type: numberToHex(profile.txType),
    chainId: numberToHex(tx.chainId),
    from: tx.sender,
    nonce: numberToHex(tx.nonceSeq),
    maxFeePerGas: numberToHex(tx.fees.maxFeePerGas),
    maxPriorityFeePerGas: numberToHex(tx.fees.maxPriorityFeePerGas),
    frames: tx.frames.map((f) => ({
      mode: numberToHex(f.mode),
      flags: numberToHex(f.flags),
      target: f.target,
      gasLimit: numberToHex(f.limits.execution),
      stateGasLimit: numberToHex(f.limits.state),
      value: numberToHex(f.value),
      data: f.data,
    })),
  };
}

function field(record: Record<string, unknown>, name: string, where: string) {
  const value = record[name];
  if (typeof value !== "string" || !isHex(value, { strict: true }))
    throw new Error(
      `The frame transaction request's ${where}${name} is not hex (it is ${printable(value, 80)})`,
    );
  return value as Hex;
}

/**
 * The unsigned transaction a request asks for, with one secp256k1 entry
 * for the sender: the inverse of `formatFrameTransactionRequest`, for a
 * wallet that signs these requests. Throws on any field it cannot read.
 */
export function parseFrameTransactionRequest(
  request: unknown,
  profile: Profile = tracer,
): FrameTx {
  if (typeof request !== "object" || request === null)
    throw new Error("The frame transaction request is not an object");
  const r = request as Record<string, unknown>;
  if (hexToNumber(field(r, "type", "")) !== profile.txType)
    throw new Error(
      `The request is not a type ${numberToHex(profile.txType)} transaction`,
    );
  const from = r.from;
  if (typeof from !== "string" || !isAddress(from, { strict: false }))
    throw new Error(
      `The frame transaction request's from is not an address (it is ${printable(from, 80)})`,
    );
  if (!Array.isArray(r.frames))
    throw new Error("The frame transaction request's frames are not a list");
  const frames = r.frames.map((value: unknown, i) => {
    if (typeof value !== "object" || value === null)
      throw new Error(
        `The frame transaction request's frame ${i + 1} is not an object`,
      );
    const f = value as Record<string, unknown>;
    const where = `frame ${i + 1} `;
    if (
      f.target !== null &&
      (typeof f.target !== "string" || !isAddress(f.target, { strict: false }))
    )
      throw new Error(
        `The frame transaction request's ${where}target is not an address or null (it is ${printable(f.target, 80)})`,
      );
    return {
      mode: hexToNumber(field(f, "mode", where)),
      flags: hexToNumber(field(f, "flags", where)),
      target: f.target as Address | null,
      limits: {
        execution: hexToBigInt(field(f, "gasLimit", where)),
        state: hexToBigInt(field(f, "stateGasLimit", where)),
      },
      value: hexToBigInt(field(f, "value", where)),
      data: field(f, "data", where),
    };
  });
  return newTx({
    chainId: hexToBigInt(field(r, "chainId", "")),
    sender: from as Address,
    nonceSeq: hexToBigInt(field(r, "nonce", "")),
    frames,
    signatures: [secp256k1Placeholder(profile)],
    fees: {
      maxFeePerGas: hexToBigInt(field(r, "maxFeePerGas", "")),
      maxPriorityFeePerGas: hexToBigInt(field(r, "maxPriorityFeePerGas", "")),
    },
  });
}

/**
 * Checks the bytes a wallet returned for `unsigned`: they must be that
 * transaction exactly, with a canonical secp256k1 signature (`v || r || s`,
 * `v` 0 or 1, low `s`) by its sender. Returns the signed transaction.
 */
async function checkSigned(
  unsigned: FrameTx,
  answer: unknown,
  profile: Profile,
): Promise<FrameTx> {
  let returned: FrameTx;
  try {
    if (typeof answer !== "string" || !isHex(answer)) throw new Error();
    returned = decodeTx(profile, answer);
  } catch {
    throw new Error(
      `The wallet returned ${printable(answer, 140)}, not a signed frame transaction: nothing was sent`,
    );
  }
  const signature = returned.signatures[0]?.signature ?? "0x";
  const signed: FrameTx = {
    ...unsigned,
    signatures: [{ ...unsigned.signatures[0]!, signature }],
  };
  if (
    returned.signatures.length !== 1 ||
    encodeTx(profile, signed).toLowerCase() !== (answer as Hex).toLowerCase()
  )
    throw new Error(
      "The wallet returned another transaction than the one it was asked to sign: nothing was sent",
    );
  const v = size(signature) === 65 ? Number(slice(signature, 0, 1)) : -1;
  const s = v < 0 ? 0n : hexToBigInt(slice(signature, 33, 65));
  if (v !== 0 && v !== 1)
    throw new Error(
      `The wallet's signature is not 65 bytes v || r || s with v 0 or 1 (it is ${printable(signature, 140)}): nothing was sent`,
    );
  if (s === 0n || s > SECP256K1_N / 2n)
    throw new Error(
      "The wallet's signature is not in canonical form (its s is not in the lower half): nothing was sent",
    );
  const signer = await recoverAddress({
    hash: sigHash(profile, unsigned),
    signature: {
      r: slice(signature, 1, 33),
      s: slice(signature, 33, 65),
      yParity: v,
    },
  });
  if (!isAddressEqual(signer, unsigned.sender))
    throw new Error(
      `The signature recovers to ${signer}, not the sender ${unsigned.sender}: nothing was sent`,
    );
  return signed;
}

/**
 * Sends a frame transaction from an account without code, signed by its
 * wallet: the wallet is asked `eth_signTransaction` with the whole
 * transaction (`formatFrameTransactionRequest`), the frames as given plus
 * the sender's pending nonce and the chain's fees. The bytes it returns are
 * sent only if they are that transaction, signed by the sender; the wallet
 * never chooses the mempool, and nothing goes through its RPC but the one
 * request. Everything else goes through `transport` (the gateway, or the
 * node for the canonical mempool of a chain without a sidecar).
 *
 * A wallet's refusal is a `FrameWalletError` carrying its text, escaped.
 */
export async function sendFrameTransactionFromWallet({
  wallet,
  sender,
  frames,
  mempool,
  transport,
  onLog,
  receiptTimeoutMs,
  maxFeePerGasCap,
  fees: givenFees,
  signal,
  chain = altMempoolDevnet,
  waitForReceipt = true,
}: {
  wallet: WalletClient;
  /** `tx.sender`: the wallet's account, without code. */
  sender: Address;
  frames: readonly FrameSpecLike[];
  mempool: "alt" | "canonical";
  /** The chain's RPC; the chain's own by default. */
  transport?: Transport;
  onLog?: (line: string, level: FrameLogLevel) => void;
  receiptTimeoutMs?: number;
  /** Refuses, before the wallet is asked, fees above this (wei per gas; 10 gwei by default). */
  maxFeePerGasCap?: bigint;
  /** Fees to carry instead of the node's: a fee given here is neither read nor capped. */
  fees?: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint };
  /** Checked once the wallet has signed: aborted, nothing is submitted. */
  signal?: AbortSignal;
  /** The frame chain; altMempoolDevnet by default. */
  chain?: Chain;
  /** false: return once the mempool admits it (a chain that never mines). */
  waitForReceipt?: boolean;
}): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }> {
  const profile = frameProfileOf(chain);
  if (typeof sender !== "string" || !isAddress(sender, { strict: false }))
    throw new Error(`The sender ${printable(sender, 60)} is not an address`);
  const requests = framesWithLimits(frames, profile);

  const walletAddress =
    wallet.account?.address ??
    (
      await wallet.getAddresses().catch((error: unknown) => {
        throw new FrameWalletError(
          `The wallet gave no account: ${printable(refusalText(error), TEXT_MAX)}`,
          { cause: error },
        );
      })
    )[0];
  if (
    typeof walletAddress !== "string" ||
    !isAddress(walletAddress, { strict: false })
  )
    throw new Error(
      walletAddress === undefined
        ? `The wallet has no account: connect the sender ${sender}`
        : `The wallet's account ${printable(walletAddress, 60)} is not an address: connect the sender ${sender}`,
    );
  if (!isAddressEqual(walletAddress, sender))
    throw new Error(
      `The connected wallet is ${printable(walletAddress, 60)}, not the sender ${sender}: connect ${sender} to sign`,
    );

  const gateway = frameClient(chain, transport);
  const nonce = await readNonce(gateway, sender);
  const fees = await readFees(
    gateway,
    frameSidecarOf(chain),
    maxFeePerGasCap,
    givenFees,
  );
  const unsigned = newTx({
    chainId: chain.id,
    sender,
    nonceSeq: BigInt(nonce),
    frames: requests,
    signatures: [secp256k1Placeholder(profile)],
    fees,
  });
  const payer = logFees(unsigned, profile, onLog);

  const answer: unknown = await wallet
    .request({
      method: "eth_signTransaction",
      params: [formatFrameTransactionRequest(unsigned, profile)],
    } as never)
    .catch((error: unknown) => {
      throw new FrameWalletError(
        `The wallet did not sign the frame transaction: ${printable(refusalText(error), TEXT_MAX)}`,
        { cause: error },
      );
    });
  const signed = await checkSigned(unsigned, answer, profile);
  // Cancelled while the wallet was asked: the signature is dropped unsent.
  if (signal?.aborted)
    throw new Error("The call was cancelled while signing: nothing was sent");

  return submitFrameTransaction({
    gateway,
    chain,
    signed,
    mempool,
    payer,
    onLog,
    receiptTimeoutMs,
    waitForReceipt,
  });
}
