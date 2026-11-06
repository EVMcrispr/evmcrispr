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
  recoverTypedDataAddress,
  size,
  type Transport,
  type TypedDataDefinition,
  WaitForTransactionReceiptTimeoutError,
  type WalletClient,
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

/** The EIP-712 domain name a FrameAccount checks its owner's signature under. */
export const FRAME_ACCOUNT_DOMAIN_NAME = "EVMcrispr Frame Account";

const FRAME_ACCOUNT_TYPES = {
  FrameTransaction: [{ name: "sigHash", type: "bytes32" }],
} as const;

const EXPLORER = altMempoolDevnet.blockExplorers.default.url;

/**
 * The typed data a FrameAccount's owner signs to authorize one frame
 * transaction: the account, the chain and the transaction's signature hash.
 */
export function frameAccountTypedData(
  account: Address,
  sigHash: Hex,
): TypedDataDefinition<typeof FRAME_ACCOUNT_TYPES, "FrameTransaction"> {
  return {
    domain: {
      name: FRAME_ACCOUNT_DOMAIN_NAME,
      version: "1",
      chainId: altMempoolDevnet.id,
      verifyingContract: account,
    },
    types: FRAME_ACCOUNT_TYPES,
    primaryType: "FrameTransaction",
    message: { sigHash },
  };
}

/** Node text in an error: escaped and cut. */
const TEXT_MAX = 300;

/** The default ceiling on either fee: 10 gwei. */
const DEFAULT_MAX_FEE_PER_GAS_CAP = 10_000_000_000n;

/** What a node said when it refused a request, without viem's decoration. */
function refusalText(error: unknown): string {
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
      ? `Frame ${n} is in the validation prefix and has no gas limit: add --gas to it (validation frames are never sized)`
      : `Frame ${n} has no gas limit: add --gas to it (a smart account's frames are not sized: give every call --gas and --state-gas)`;
  if (!inPrefix && frame.stateGas === undefined)
    return `Frame ${n} has no state gas limit: add --state-gas to frame:tx (a smart account's frames are not sized)`;
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
    ? `the account ${printable(tx.sender, 60)}`
    : `the sponsor ${printable(paying.target, 60)}`;
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
 * What the owner is about to authorize, in plain text, read from the
 * unsigned frame transaction whose signature hash is signed (not from the
 * specs it was built from): every frame's mode, approval scope, atomic flag,
 * target, value, limits and whole calldata, who pays, the nonce, the fees,
 * the most it can cost, and the hash the typed data carries. Everything is
 * escaped.
 */
export function describeAccountFrameTransaction({
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
      f.target === null ? `the account ${sender}` : printable(f.target, 60);
    return [
      `Frame ${i + 1}: ${printable(mode, 40)}${scope}${atomic} to ${target}, value ${f.value} wei, gas ${f.limits.execution} + state gas ${f.limits.state}`,
      ...dataLines(f.data),
    ];
  });
  return [
    `Frame transaction from the account ${sender}`,
    ...lines,
    `Paid by ${printable(payerOfTx(tx, profile), 200)}`,
    `Nonce ${tx.nonceSeq}; max fee ${formatGwei(tx.fees.maxFeePerGas)} gwei per gas (priority ${formatGwei(tx.fees.maxPriorityFeePerGas)}); ${costLine(tx)}`,
    `Signature hash ${printable(hash, 70)}`,
  ].join("\n");
}

/**
 * Sends a frame transaction from a smart account (a FrameAccount) whose
 * owner authorizes it with an EIP-712 signature, from any wallet: a JSON-RPC
 * account (MetaMask, a wallet RPC) or a local one.
 *
 * The transaction is exactly `frames`, with the account's pending nonce and
 * the sidecar's fees added; nothing sizes it, so every frame carries its
 * limits. Its one signature entry is `ARBITRARY` with an empty `msg`: the
 * wallet signs `frameAccountTypedData(account, sigHash)` and the account's
 * VERIFY code checks it. Nonce, code, fees, submission and the receipt all
 * go through `transport` (the gateway), never through the wallet's RPC.
 *
 * Lines given to `onLog` use EVMcrispr's `:success:` / `:warning:` prefixes,
 * and every string from the gateway or the node in them, or in an error, is
 * escaped.
 */
export async function sendAccountFrameTransaction({
  wallet,
  account,
  owner,
  frames,
  mempool,
  transport,
  onLog,
  receiptTimeoutMs = 120_000,
  maxFeePerGasCap = DEFAULT_MAX_FEE_PER_GAS_CAP,
  signWith,
  signal,
}: {
  wallet: WalletClient;
  /** The FrameAccount: `tx.sender`. */
  account: Address;
  /** The account's owner: must be the wallet's address. */
  owner: Address;
  frames: readonly FrameSpecLike[];
  mempool: "alt" | "canonical";
  /** The gateway; altMempoolDevnet's by default. */
  transport?: Transport;
  onLog?: (line: string) => void;
  receiptTimeoutMs?: number;
  /** Refuses, before signing, fees above this (wei per gas; 10 gwei by default): the wallet never sees them. */
  maxFeePerGasCap?: bigint;
  /** Wraps the one signature request with a description of the transaction (a host that confirms signatures shows it). */
  signWith?: <T>(description: string, sign: () => Promise<T>) => Promise<T>;
  /** Checked once the wallet has signed: aborted, nothing is submitted. */
  signal?: AbortSignal;
}): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }> {
  const chain = altMempoolDevnet;
  const profile = frameProfileOf(chain);

  // Both go into every line below: refused here unless they are addresses.
  for (const [name, value] of [
    ["account", account],
    ["owner", owner],
  ] as const)
    if (typeof value !== "string" || !isAddress(value, { strict: false }))
      throw new Error(
        `The frame account's ${name} ${printable(value, 60)} is not an address`,
      );

  // Every frame carries its limits: nothing is sized, so the one signature
  // asked for is over the transaction exactly as sent.
  const prefix = prefixLength(frames);
  frames.forEach((frame, i) => {
    const missing = missingLimit(frame, i, i < prefix);
    if (missing) throw new Error(missing);
  });
  const requests = toFrameRequests(frames, profile);
  if (!requests.every((f) => f.limits))
    throw new Error("Every frame needs its limits: give --gas and --state-gas");

  const walletAddress =
    wallet.account?.address ??
    (
      await wallet.getAddresses().catch((error: unknown) => {
        throw new Error(
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
        ? `The wallet has no account: connect the account's owner ${owner}`
        : `The wallet's account ${printable(walletAddress, 60)} is not an address: connect the account's owner ${owner}`,
    );
  if (!isAddressEqual(walletAddress, owner))
    throw new Error(
      `The connected wallet is ${printable(walletAddress, 60)}, but the account ${account} is owned by ${owner}: connect ${owner} to sign`,
    );

  const gateway = createPublicClient({ chain, transport: transport ?? http() });
  // Every gateway answer below is the node's text in viem's errors: escaped.
  const code = await getCode(gateway, { address: account }).catch(
    (error: unknown) => {
      throw new Error(
        `The gateway could not read ${account}'s code: ${printable(refusalText(error), TEXT_MAX)}`,
      );
    },
  );
  if (!code || code === "0x")
    throw new Error(
      `${account} has no code on the ${chain.name}: it is not a frame account (deploy one with frame:new-account)`,
    );

  const nonce = await getTransactionCount(gateway, {
    address: account,
    blockTag: "pending",
  }).catch((error: unknown) => {
    throw new Error(
      `The gateway could not read ${account}'s nonce: ${printable(refusalText(error), TEXT_MAX)}`,
    );
  });
  // A malformed answer would otherwise reach the error through BigInt's message.
  const fees = await sidecarGasPrice(gateway).catch((error: unknown) => {
    throw new Error(
      `The gateway gave no usable fees (skandha_getGasPrice): ${printable(refusalText(error), TEXT_MAX)}`,
    );
  });

  // The wallet signs a hash: it never sees the fees, so they are capped and
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
    sender: account,
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
  );
  const hashToSign = sigHash(profile, unsigned);
  const typedData = frameAccountTypedData(account, hashToSign);

  const description = describeAccountFrameTransaction({
    tx: unsigned,
    profile,
    sigHash: hashToSign,
  });
  const ask = () =>
    wallet.signTypedData({
      account: wallet.account ?? walletAddress,
      ...typedData,
    });
  const signature: unknown = await (signWith
    ? signWith(description, ask)
    : ask()
  ).catch((error: unknown) => {
    throw new Error(
      `The wallet did not sign: ${printable(refusalText(error), TEXT_MAX)}`,
      { cause: error },
    );
  });
  if (
    typeof signature !== "string" ||
    !isHex(signature) ||
    size(signature) !== 65
  )
    throw new Error(
      `The wallet did not return a 65-byte signature (it returned ${printable(signature, 140)}): nothing was sent`,
    );
  const signer = await recoverTypedDataAddress({ ...typedData, signature });
  if (!isAddressEqual(signer, owner))
    throw new Error(
      `The signature was not signed by the owner ${owner} (it recovers to ${signer}): nothing was sent`,
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
  // Cancelled while the wallet was asked: the signature is dropped unsent.
  if (signal?.aborted)
    throw new Error(
      "The run was cancelled after the wallet signed: nothing was sent",
    );

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
      `The ${mempool} mempool refused the frame transaction from ${account}, paid by ${payer}: ${printable(refusalText(error), TEXT_MAX)}`,
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
    `:success:Frame transaction ${expected} from account ${account} admitted to the ${mempool} mempool of the ${chain.name} (status ${await status()})`,
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
        `${expected} was admitted but not mined within ${Math.round(receiptTimeoutMs / 1000)} s (status ${await status()}): stopping, since a later transaction from the account would reuse its nonce. ${EXPLORER}`,
      );
    throw new Error(
      `Waiting for ${expected}'s receipt failed: ${printable(refusalText(error), TEXT_MAX)}`,
    );
  }
  onLog?.(
    `:success:Frame transaction ${expected} mined in block ${printable(receipt.blockNumber)}, paid by ${receipt.payer === undefined ? "an unknown payer" : printable(receipt.payer)}`,
  );
  receipt.frameReceipts?.forEach((frame, i) => {
    onLog?.(
      `${frame.status === "success" ? ":success:" : ":warning:"}Frame ${i + 1}: ${printable(frame.status)}`,
    );
  });
  return { hash: expected, receipt };
}
