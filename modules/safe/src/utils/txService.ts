import type { Address } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type Safe from "..";
import { CHAIN_SHORT_NAMES } from "../addresses";
import { getSafeNonce } from "./reads";
import type { SafeTx } from "./safeTx";

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
 *  proposals on the service. */
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
      `/api/v1/safes/${safe}/multisig-transactions/?executed=false&limit=1&ordering=-nonce`,
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
    `/api/v1/safes/${safe}/multisig-transactions/?nonce=${nonce}`,
  );
  return res?.results ?? [];
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

export const getQueueLink = (chainId: number, safe: Address): string =>
  `https://app.safe.global/transactions/queue?safe=${getChainShortName(
    chainId,
  )}:${safe}`;
