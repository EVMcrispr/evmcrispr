import type { Address } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import { isAddressEqual, type PublicClient } from "viem";
import type Safe from "..";
import { CHAIN_SHORT_NAMES } from "../addresses";
import { getSafeNonce } from "./reads";
import type { SafeTx } from "./safeTx";
import {
  contentMessageSignable,
  expectKind,
  parseContractSignatureBlob,
  parseSafeSignature,
  type SafeMessageContent,
  type SafeSignable,
  type SafeSignature,
  transactionSignable,
} from "./signables";

export const getChainShortName = (chainId: number): string => {
  const shortName = CHAIN_SHORT_NAMES.get(chainId);
  if (!shortName) {
    throw new ErrorException(
      `chain ${chainId} is not supported by the Safe Transaction Service; set $safe:serviceUrl to use a custom service`,
    );
  }
  return shortName;
};

const getServiceBaseUrl = (module: Safe, chainId: number): string => {
  const custom = module.getConfigBinding("serviceUrl");
  if (custom) return String(custom).replace(/\/$/, "");
  return `https://api.safe.global/tx-service/${getChainShortName(chainId)}`;
};

const getServiceHeaders = (module: Safe): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = module.getConfigBinding("apiKey");
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
};

const serviceFetch = async (
  module: Safe,
  chainId: number,
  path: string,
  init?: RequestInit,
): Promise<any> => {
  const url = `${getServiceBaseUrl(module, chainId)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...getServiceHeaders(module), ...init?.headers },
  });
  if (res.status === 404) {
    throw new ErrorNotFound(`Safe Transaction Service: not found (${url})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ErrorException(
      `Safe Transaction Service request failed (${res.status}): ${body || url}`,
    );
  }
  if (res.status === 204) return undefined;
  return res.json();
};

/** Next free nonce: the on-chain nonce, skipping past any pending queued
 *  proposals on the service. Only trusted (owner- or delegate-signed)
 *  proposals count: anyone can push an unsigned one. */
export const getNextNonce = async (
  module: Safe,
  client: PublicClient,
  chainId: number,
  safe: Address,
): Promise<bigint> => {
  const chainNonce = await getSafeNonce(client, safe);
  try {
    const queue = await serviceFetch(
      module,
      chainId,
      `/api/v1/safes/${safe}/multisig-transactions/?executed=false&trusted=true&limit=1&ordering=-nonce`,
    );
    const maxQueued = queue?.results?.[0]?.nonce;
    if (maxQueued !== undefined && maxQueued !== null) {
      const next = BigInt(maxQueued) + 1n;
      return next > chainNonce ? next : chainNonce;
    }
  } catch {
    // Service unavailable for this Safe (e.g. not indexed yet): fall back
    // to the on-chain nonce.
  }
  return chainNonce;
};

export interface ProposalPayload {
  safe: Address;
  tx: SafeTx;
  safeTxHash: `0x${string}`;
  sender: Address;
  signature: `0x${string}`;
  origin: string;
}

export const proposeTransaction = async (
  module: Safe,
  chainId: number,
  { safe, tx, safeTxHash, sender, signature, origin }: ProposalPayload,
): Promise<void> => {
  await serviceFetch(
    module,
    chainId,
    `/api/v1/safes/${safe}/multisig-transactions/`,
    {
      method: "POST",
      body: JSON.stringify({
        safe,
        to: tx.to,
        value: tx.value.toString(),
        data: tx.data === "0x" ? null : tx.data,
        operation: tx.operation,
        safeTxGas: tx.safeTxGas.toString(),
        baseGas: tx.baseGas.toString(),
        gasPrice: tx.gasPrice.toString(),
        gasToken: tx.gasToken,
        refundReceiver: tx.refundReceiver,
        nonce: tx.nonce.toString(),
        contractTransactionHash: safeTxHash,
        sender,
        signature,
        origin,
      }),
    },
  );
};

/** Add an owner's EIP-712 signature to a transaction already queued on the
 *  service. */
export const confirmTransaction = async (
  module: Safe,
  chainId: number,
  safeTxHash: `0x${string}`,
  signature: `0x${string}`,
): Promise<void> => {
  await serviceFetch(
    module,
    chainId,
    `/api/v1/multisig-transactions/${safeTxHash}/confirmations/`,
    { method: "POST", body: JSON.stringify({ signature }) },
  );
};

export interface ServiceTransaction {
  safe: Address;
  to: Address;
  value: string;
  data: `0x${string}` | null;
  operation: 0 | 1;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: Address;
  refundReceiver: Address;
  nonce: string;
  safeTxHash: `0x${string}`;
  confirmationsRequired: number;
  isExecuted: boolean;
  confirmations: { owner: Address; signature: `0x${string}` }[];
}

export const getServiceTransaction = async (
  module: Safe,
  chainId: number,
  safeTxHash: string,
): Promise<ServiceTransaction> =>
  serviceFetch(module, chainId, `/api/v1/multisig-transactions/${safeTxHash}/`);

export const getServiceTransactionsByNonce = async (
  module: Safe,
  chainId: number,
  safe: Address,
  nonce: bigint,
): Promise<ServiceTransaction[]> => {
  const res = await serviceFetch(
    module,
    chainId,
    `/api/v1/safes/${safe}/multisig-transactions/?nonce=${nonce}&trusted=true`,
  );
  return res?.results ?? [];
};

/** Warn when other queued transactions compete for `nonce`: only one of them
 *  can ever execute, so signing or executing one silently drops the rest. */
export const warnCompetingTransactions = async (
  module: Safe,
  chainId: number,
  safe: Address,
  nonce: bigint,
  safeTxHash?: string,
): Promise<void> => {
  let queued: ServiceTransaction[];
  try {
    queued = await getServiceTransactionsByNonce(module, chainId, safe, nonce);
  } catch {
    module.context.log(
      `⚠️ WARNING: could not check the Safe Transaction Service for other transactions queued at nonce ${nonce}`,
    );
    return;
  }
  const others = queued.filter(
    (t) =>
      !t.isExecuted && t.safeTxHash.toLowerCase() !== safeTxHash?.toLowerCase(),
  );
  if (others.length === 0) return;
  module.context.log(
    `⚠️ WARNING: ${others.length} other transaction${others.length === 1 ? " is" : "s are"} queued at nonce ${nonce} — only one can execute:\n${others.map((t) => `  ${t.safeTxHash}`).join("\n")}`,
  );
};

export const serviceTxToSafeTx = (serviceTx: ServiceTransaction): SafeTx => ({
  to: serviceTx.to,
  value: BigInt(serviceTx.value),
  data: serviceTx.data ?? "0x",
  operation: serviceTx.operation,
  safeTxGas: BigInt(serviceTx.safeTxGas),
  baseGas: BigInt(serviceTx.baseGas),
  gasPrice: BigInt(serviceTx.gasPrice),
  gasToken: serviceTx.gasToken,
  refundReceiver: serviceTx.refundReceiver,
  nonce: BigInt(serviceTx.nonce),
});

export interface ServiceMessage {
  safe: Address;
  messageHash: `0x${string}`;
  message: SafeMessageContent;
  confirmations: { owner: Address; signature: `0x${string}` }[];
}

/** Queue a Safe message (text or EIP-712 typed data) with its first owner
 *  signature; the service derives the proposer from the signature. */
export const proposeMessage = async (
  module: Safe,
  chainId: number,
  safe: Address,
  message: SafeMessageContent,
  signature: `0x${string}`,
  origin?: string,
): Promise<void> => {
  await serviceFetch(module, chainId, `/api/v1/safes/${safe}/messages/`, {
    method: "POST",
    body: JSON.stringify({ message, signature, ...(origin ? { origin } : {}) }),
  });
};

export const getServiceMessage = async (
  module: Safe,
  chainId: number,
  safeMessageHash: string,
): Promise<ServiceMessage> =>
  serviceFetch(module, chainId, `/api/v1/messages/${safeMessageHash}/`);

/** Add an owner signature to a Safe message already on the service. */
export const confirmMessage = async (
  module: Safe,
  chainId: number,
  safeMessageHash: `0x${string}`,
  signature: `0x${string}`,
): Promise<void> => {
  await serviceFetch(
    module,
    chainId,
    `/api/v1/messages/${safeMessageHash}/signatures/`,
    { method: "POST", body: JSON.stringify({ signature }) },
  );
};

const ownerConfirmations = (
  confirmations: { signature: `0x${string}` }[] | undefined,
) => {
  const signatures: SafeSignature[] = [];
  let skipped = 0;
  for (const c of confirmations ?? []) {
    try {
      signatures.push(parseSafeSignature(c.signature));
    } catch {
      // An owner Safe's confirmation: its static part and dynamic data.
      const contract = parseContractSignatureBlob(c.signature);
      if (contract) signatures.push(contract);
      else skipped++;
    }
  }
  return { signatures, skipped };
};

/** A queued transaction or message, rebuilt locally from the service data.
 *  Never trusts the service: the rebuilt item must hash to the requested
 *  hash, and belong to `safe`. EOA confirmations come along as signatures;
 *  other confirmation types are counted in `skipped` (on-chain approvals are
 *  found by the review anyway, the rest cannot be recovered locally). */
export async function fetchQueuedSignable(
  module: Safe,
  chainId: number,
  safe: Address,
  input:
    | { kind: "txHash"; hash: `0x${string}` }
    | { kind: "messageHash"; hash: `0x${string}` }
    | { kind: "nonce"; nonce: bigint },
): Promise<{
  signable: SafeSignable;
  skipped: number;
  serviceTx?: ServiceTransaction;
}> {
  if (input.kind === "messageHash") {
    const serviceMessage = await getServiceMessage(module, chainId, input.hash);
    if (!isAddressEqual(serviceMessage.safe, safe))
      throw new ErrorException(
        `Safe message ${input.hash} belongs to Safe ${serviceMessage.safe}, not ${safe}`,
      );
    const rebuilt = contentMessageSignable(
      chainId,
      safe,
      serviceMessage.message,
    );
    expectKind(rebuilt, "message");
    if (rebuilt.safeMessageHash.toLowerCase() !== input.hash.toLowerCase())
      throw new ErrorException(
        `safeMessageHash mismatch: the Safe Transaction Service message for ${input.hash} hashes to ${rebuilt.safeMessageHash} — the service data may be tampered with; do NOT sign it`,
      );
    const { signatures, skipped } = ownerConfirmations(
      serviceMessage.confirmations,
    );
    return { signable: { ...rebuilt, signatures }, skipped };
  }
  let serviceTx: ServiceTransaction;
  if (input.kind === "txHash") {
    serviceTx = await getServiceTransaction(module, chainId, input.hash);
  } else {
    const queued = (
      await getServiceTransactionsByNonce(module, chainId, safe, input.nonce)
    ).filter((t) => !t.isExecuted);
    if (queued.length === 0)
      throw new ErrorNotFound(
        `no queued transaction found for Safe ${safe} at nonce ${input.nonce}`,
      );
    if (queued.length > 1)
      throw new ErrorException(
        `${queued.length} transactions are queued at nonce ${input.nonce} — only one can execute; pass the safeTxHash of the one you mean:\n${queued.map((t) => `  ${t.safeTxHash}`).join("\n")}`,
      );
    serviceTx = queued[0];
  }
  if (!isAddressEqual(serviceTx.safe, safe))
    throw new ErrorException(
      `Safe transaction ${serviceTx.safeTxHash} belongs to Safe ${serviceTx.safe}, not ${safe}`,
    );
  const { signatures, skipped } = ownerConfirmations(serviceTx.confirmations);
  const signable = transactionSignable(
    chainId,
    safe,
    serviceTxToSafeTx(serviceTx),
    signatures,
  );
  expectKind(signable, "transaction");
  const requested = input.kind === "txHash" ? input.hash : serviceTx.safeTxHash;
  if (signable.safeTxHash.toLowerCase() !== requested.toLowerCase())
    throw new ErrorException(
      `safeTxHash mismatch: the Safe Transaction Service data for ${requested} hashes to ${signable.safeTxHash} — the service data may be tampered with; do NOT sign or execute this transaction`,
    );
  return { signable, skipped, serviceTx };
}

export const getQueueLink = (chainId: number, safe: Address): string =>
  `https://app.safe.global/transactions/queue?safe=${getChainShortName(
    chainId,
  )}:${safe}`;
