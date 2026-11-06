import { toWire } from "@forshtat/hegota-support/rpc";
import { encodeTx, newTx, sigHash, txHash } from "@forshtat/hegota-support/tx";
import {
  type Address,
  BaseError,
  createPublicClient,
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
import { arbitrarySignatureEntry } from "./serializer";
import type { Frame, FrameTransactionReceipt, FrameTx } from "./types";

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

/**
 * Text from a wallet, a gateway or a node, safe to write to a terminal or a
 * log: C0 and C1 controls (ESC, CR, LF among them), DEL and bidirectional
 * controls become visible escapes. Cut to `max` characters.
 */
function printable(value: unknown, max = 300): string {
  const text = String(value);
  const shown = text.slice(0, max).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
    /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g,
    (c) => {
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      const code = c.charCodeAt(0);
      return code <= 0xff
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : `\\u${code.toString(16).padStart(4, "0")}`;
    },
  );
  return text.length > max ? `${shown}…` : shown;
}

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

/** Who pays, as the frames say: the first verify frame approving payment. */
function payerOf(frames: readonly FrameSpecLike[], account: Address): string {
  const paying = frames.find(
    (f) =>
      f.mode === "verify" && (f.approve === "payment" || f.approve === "both"),
  );
  if (!paying) return "no payer";
  return paying.target === null || isAddressEqual(paying.target, account)
    ? `the account ${account}`
    : `the sponsor ${paying.target}`;
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
}): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }> {
  const chain = altMempoolDevnet;
  const profile = frameProfileOf(chain);

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
    wallet.account?.address ?? (await wallet.getAddresses())[0];
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
      `The connected wallet is ${printable(walletAddress)}, but the account ${account} is owned by ${owner}: connect ${owner} to sign`,
    );

  const gateway = createPublicClient({ chain, transport: transport ?? http() });
  const code = await getCode(gateway, { address: account });
  if (!code || code === "0x")
    throw new Error(
      `${account} has no code on the ${chain.name}: it is not a frame account (deploy one with frame:new-account)`,
    );

  const nonce = await getTransactionCount(gateway, {
    address: account,
    blockTag: "pending",
  });
  // A malformed answer would otherwise reach the error through BigInt's message.
  const fees = await sidecarGasPrice(gateway).catch((error: unknown) => {
    throw new Error(
      `The gateway gave no usable fees (skandha_getGasPrice): ${printable(refusalText(error))}`,
    );
  });

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
  const hashToSign = sigHash(profile, unsigned);
  const typedData = frameAccountTypedData(account, hashToSign);

  const signature: unknown = await wallet.signTypedData({
    account: wallet.account ?? walletAddress,
    ...typedData,
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
      `The ${mempool} mempool refused the frame transaction from ${account}, paid by ${payerOf(frames, account)}: ${printable(refusalText(error))}`,
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
    throw error;
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
