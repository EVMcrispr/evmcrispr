import { toWire } from "@forshtat/hegota-support/rpc";
import { encodeTx, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import {
  type Address,
  BaseError,
  createPublicClient,
  formatEther,
  formatGwei,
  type Hash,
  type Hex,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  size,
  type Transport,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { getCode, getTransactionCount } from "viem/actions";
import { altMempoolDevnet, frameProfileOf, sidecarGasPrice } from "./chain";
import {
  type FrameSpecLike,
  prefixLength,
  toFrameRequests,
} from "./frame-specs";
import { ATOMIC_BATCH_FLAG } from "./frames";
import { printable } from "./printable";
import { arbitrarySignatureEntry } from "./serializer";
import type { Frame, FrameTransactionReceipt, FrameTx, Profile } from "./types";

/** How much a line given to `onLog` matters, for the caller to show. */
export type FrameLogLevel = "info" | "success" | "warning";

const EXPLORER = altMempoolDevnet.blockExplorers.default.url;

/** Node text in an error: escaped and cut. */
const TEXT_MAX = 300;

/** The default ceiling on either fee: 10 gwei. */
const DEFAULT_MAX_FEE_PER_GAS_CAP = 10_000_000_000n;

/** What a node or a wallet said when it refused a request, without viem's decoration. */
export function refusalText(error: unknown): string {
  if (error instanceof BaseError) {
    const inner = error.walk(
      (e) =>
        e instanceof BaseError &&
        typeof e.details === "string" &&
        e.details !== "",
    ) as BaseError | null;
    return inner?.details || error.details || error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Why a frame cannot be sent as written, numbered from 1; undefined when it can. */
function missingLimit(
  frame: FrameSpecLike,
  i: number,
  inPrefix: boolean,
): string | undefined {
  const n = i + 1;
  if (frame.gas === undefined)
    return inPrefix
      ? `Frame ${n} is in the validation prefix and has no \`gas\` (validation frames are never sized)`
      : `Frame ${n} has no \`gas\` (these frames are not sized: every frame needs \`gas\`, and every one after the validation prefix \`stateGas\`)`;
  if (!inPrefix && frame.stateGas === undefined)
    return `Frame ${n} has no \`stateGas\` (these frames are not sized)`;
  return undefined;
}

/** The name a profile gives a value of one of its tables, else the number. */
function nameOf(table: Record<string, number>, value: number): string {
  const found = Object.entries(table).find(([, v]) => v === value)?.[0];
  return found ? found.toLowerCase().replaceAll("_", " ") : `#${value}`;
}

/** The payer the signed frames name: the first verify frame approving payment. */
function payerOfTx(tx: FrameTx, profile: Profile): string {
  const paying = tx.frames.find(
    (f) =>
      f.mode === profile.frameModes.VERIFY &&
      ((f.flags & 0x3) === profile.approveScopes.PAYMENT ||
        (f.flags & 0x3) === profile.approveScopes.EXECUTION_AND_PAYMENT),
  );
  if (!paying) return "no payer";
  return paying.target === null || isAddressEqual(paying.target, tx.sender)
    ? `the sender ${printable(tx.sender, 60)}`
    : `the paymaster ${printable(paying.target, 60)}`;
}

/** The gas the frames' limits allow, and the most it costs at the max fee:
 *  the transaction's intrinsic cost comes on top. */
function costLine(tx: FrameTx): string {
  const gas = tx.frames.reduce(
    (sum, f) => sum + f.limits.execution + f.limits.state,
    0n,
  );
  return `up to ${formatEther(gas * tx.fees.maxFeePerGas)} ETH for ${gas} frame gas (plus the transaction's intrinsic cost)`;
}

/** The calldata in full: the selector, then one 32-byte word per line. */
function dataLines(data: Hex): string[] {
  if (size(data) === 0) return ["    no data"];
  const hex = data.slice(2);
  const lines = [
    `    data 0x${printable(hex.slice(0, 8))} (${size(data)} bytes)`,
  ];
  for (let i = 8; i < hex.length; i += 64)
    lines.push(`      ${printable(hex.slice(i, i + 64))}`);
  return lines;
}

/**
 * What is about to be signed, in plain text, read from the unsigned frame
 * transaction whose signature hash is signed (not from the specs it was
 * built from): every frame's mode, approval scope, atomic flag, target,
 * value, limits and whole calldata, who pays, the nonce, the fees, the most
 * it can cost, and the signature hash. Everything is escaped.
 */
export function describeFrameTransaction({
  tx,
  profile,
  sigHash: hash,
}: {
  tx: FrameTx;
  profile: Profile;
  sigHash: Hex;
}): string {
  const sender = printable(tx.sender, 60);
  const lines = tx.frames.flatMap((f, i) => {
    const mode = nameOf(profile.frameModes, f.mode);
    const scope =
      f.mode === profile.frameModes.VERIFY
        ? ` approving ${(f.flags & 0x3) === 0 ? "nothing" : nameOf(profile.approveScopes, f.flags & 0x3)}`
        : "";
    const atomic =
      f.flags & ATOMIC_BATCH_FLAG ? ", atomic with the next frame" : "";
    const target =
      f.target === null ? `the sender ${sender}` : printable(f.target, 60);
    return [
      `Frame ${i + 1}: ${printable(mode, 40)}${scope}${atomic} to ${target}, value ${f.value} wei, gas ${f.limits.execution} + state gas ${f.limits.state}`,
      ...dataLines(f.data),
    ];
  });
  return [
    `Frame transaction from ${sender}`,
    ...lines,
    `Paid by ${printable(payerOfTx(tx, profile), 200)}`,
    `Nonce ${tx.nonceSeq}; max fee ${formatGwei(tx.fees.maxFeePerGas)} gwei per gas (priority ${formatGwei(tx.fees.maxPriorityFeePerGas)}); ${costLine(tx)}`,
    `Signature hash ${printable(hash, 70)}`,
  ].join("\n");
}

/**
 * Sends a frame transaction from a contract sender whose VERIFY code checks
 * the transaction's one signature entry, an `ARBITRARY` entry with an empty
 * `msg`. `sign` is given the transaction's signature hash and returns the
 * entry's bytes, in whatever form the sender's code expects.
 *
 * The transaction is exactly `frames`, with the sender's pending nonce and
 * the sidecar's fees added; nothing sizes it, so every frame carries its
 * limits, and the one signature is over the transaction exactly as sent.
 * Nonce, code, fees, submission and the receipt all go through `transport`
 * (the gateway).
 *
 * Each line given to `onLog` comes with its level (`info`, `success` or
 * `warning`) for the caller to show as it shows its own; every string from
 * the gateway or the node in them, or in an error, is escaped. An error
 * `sign` throws is passed on unchanged.
 */
export async function sendFrameTransactionWithArbitrarySignature({
  sender,
  frames,
  mempool,
  sign,
  transport,
  onLog,
  receiptTimeoutMs = 120_000,
  maxFeePerGasCap = DEFAULT_MAX_FEE_PER_GAS_CAP,
  signWith,
  signal,
}: {
  /** `tx.sender`: a contract. */
  sender: Address;
  frames: readonly FrameSpecLike[];
  mempool: "alt" | "canonical";
  /** The signature entry's bytes for this signature hash. */
  sign: (sigHash: Hex) => Promise<Hex>;
  /** The gateway; altMempoolDevnet's by default. */
  transport?: Transport;
  onLog?: (line: string, level: FrameLogLevel) => void;
  receiptTimeoutMs?: number;
  /** Refuses, before signing, fees above this (wei per gas; 10 gwei by default): the signer never sees them. */
  maxFeePerGasCap?: bigint;
  /** Wraps the one signature with a description of the transaction (a caller that confirms signatures shows it). */
  signWith?: <T>(description: string, sign: () => Promise<T>) => Promise<T>;
  /** Checked once `sign` has returned: aborted, nothing is submitted. */
  signal?: AbortSignal;
}): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }> {
  const chain = altMempoolDevnet;
  const profile = frameProfileOf(chain);

  // It goes into every line below: refused here unless it is an address.
  if (typeof sender !== "string" || !isAddress(sender, { strict: false }))
    throw new Error(`The sender ${printable(sender, 60)} is not an address`);

  const prefix = prefixLength(frames);
  frames.forEach((frame, i) => {
    const missing = missingLimit(frame, i, i < prefix);
    if (missing) throw new Error(missing);
  });
  const requests = toFrameRequests(frames, profile);
  if (!requests.every((f) => f.limits))
    throw new Error(
      "Every frame needs its limits: `gas`, and `stateGas` after the validation prefix",
    );

  const gateway = createPublicClient({ chain, transport: transport ?? http() });
  // Every gateway answer below is the node's text in viem's errors: escaped.
  const code = await getCode(gateway, { address: sender }).catch(
    (error: unknown) => {
      throw new Error(
        `The gateway could not read ${sender}'s code: ${printable(refusalText(error), TEXT_MAX)}`,
      );
    },
  );
  if (!code || code === "0x")
    throw new Error(
      `${sender} has no code on the ${chain.name}: there is nothing to check an ARBITRARY signature`,
    );

  const nonce = await getTransactionCount(gateway, {
    address: sender,
    blockTag: "pending",
  }).catch((error: unknown) => {
    throw new Error(
      `The gateway could not read ${sender}'s nonce: ${printable(refusalText(error), TEXT_MAX)}`,
    );
  });
  // A malformed answer would otherwise reach the error through BigInt's message.
  const fees = await sidecarGasPrice(gateway).catch((error: unknown) => {
    throw new Error(
      `The gateway gave no usable fees (skandha_getGasPrice): ${printable(refusalText(error), TEXT_MAX)}`,
    );
  });

  // The signer signs a hash: it never sees the fees, so they are capped and
  // shown here, with the most the transaction can cost its payer.
  for (const [name, fee] of [
    ["maxFeePerGas", fees.maxFeePerGas],
    ["maxPriorityFeePerGas", fees.maxPriorityFeePerGas],
  ] as const)
    if (fee > maxFeePerGasCap)
      throw new Error(
        `The gateway asks a ${name} of ${formatGwei(fee)} gwei, above the cap of ${formatGwei(maxFeePerGasCap)} gwei: nothing was signed`,
      );
  const unsigned: FrameTx = newTx({
    chainId: chain.id,
    sender,
    nonceSeq: BigInt(nonce),
    frames: requests as Frame[],
    signatures: [arbitrarySignatureEntry("0x", profile)],
    fees: {
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    },
  });
  const payer = printable(payerOfTx(unsigned, profile), 200);
  onLog?.(
    `Fees: max ${formatGwei(fees.maxFeePerGas)} gwei per gas (priority ${formatGwei(fees.maxPriorityFeePerGas)}); ${costLine(unsigned)}, paid by ${payer}`,
    "info",
  );
  const hashToSign = sigHash(profile, unsigned);
  const description = describeFrameTransaction({
    tx: unsigned,
    profile,
    sigHash: hashToSign,
  });
  const ask = () => sign(hashToSign);
  const signature: unknown = await (signWith
    ? signWith(description, ask)
    : ask());
  if (typeof signature !== "string" || !isHex(signature))
    throw new Error(
      `The signature is not hex (it is ${printable(signature, 140)}): nothing was sent`,
    );

  const signed: FrameTx = {
    ...unsigned,
    signatures: [arbitrarySignatureEntry(signature, profile)],
  };
  // The ARBITRARY entry's bytes are elided from the hash it signs: filling
  // them must leave the transaction the one that was signed.
  if (sigHash(profile, signed) !== hashToSign)
    throw new Error(
      "The signed transaction's signature hash differs from the one signed: nothing was sent",
    );
  const expected = txHash(profile, signed) as Hash;
  // Cancelled while the signer was asked: the signature is dropped unsent.
  if (signal?.aborted)
    throw new Error("The call was cancelled while signing: nothing was sent");

  let answer: unknown;
  try {
    answer =
      mempool === "canonical"
        ? await gateway.request({
            method: "eth_sendRawTransaction",
            params: [encodeTx(profile, signed)],
          } as never)
        : await gateway.request({
            method: "eth_sendFrameTransaction",
            params: [toWire(signed)],
          } as never);
  } catch (error) {
    throw new Error(
      `The ${mempool} mempool refused the frame transaction from ${sender}, paid by ${payer}: ${printable(refusalText(error), TEXT_MAX)}`,
    );
  }
  // Only the hash of the bytes signed is shown and waited on.
  if (
    typeof answer !== "string" ||
    answer.toLowerCase() !== expected.toLowerCase()
  )
    throw new Error(
      `The ${mempool === "canonical" ? "node" : "gateway"} returned ${printable(typeof answer === "string" ? answer : JSON.stringify(answer), 80)} for a transaction whose hash is ${expected}`,
    );

  const status = async () =>
    printable(
      (
        (await gateway
          .request({
            method: "skandha_frameTransactionStatus",
            params: [expected],
          } as never)
          .catch(() => undefined)) as { status?: unknown } | undefined
      )?.status ?? "unknown",
      40,
    );
  onLog?.(
    `Frame transaction ${expected} from ${sender} admitted to the ${mempool} mempool of the ${chain.name} (status ${await status()})`,
    "success",
  );

  let receipt: FrameTransactionReceipt;
  try {
    receipt = (await gateway.waitForTransactionReceipt({
      hash: expected,
      timeout: receiptTimeoutMs,
    })) as FrameTransactionReceipt;
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError)
      throw new Error(
        `${expected} was admitted but not mined within ${Math.round(receiptTimeoutMs / 1000)} s (status ${await status()}): stopping, since a later transaction from the sender would reuse its nonce. ${EXPLORER}`,
      );
    throw new Error(
      `Waiting for ${expected}'s receipt failed: ${printable(refusalText(error), TEXT_MAX)}`,
    );
  }
  onLog?.(
    `Frame transaction ${expected} mined in block ${printable(receipt.blockNumber)}, paid by ${receipt.payer === undefined ? "an unknown payer" : printable(receipt.payer)}`,
    "success",
  );
  receipt.frameReceipts?.forEach((frame, i) => {
    onLog?.(
      `Frame ${i + 1}: ${printable(frame.status)}`,
      frame.status === "success" ? "success" : "warning",
    );
  });
  return { hash: expected, receipt };
}
