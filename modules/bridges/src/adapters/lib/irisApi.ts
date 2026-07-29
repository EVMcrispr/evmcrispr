import { ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { IRIS_API } from "../../addresses";

/**
 * Client for Circle's Iris attestation service (v2 API).
 * https://developers.circle.com/stablecoins/reference
 */

export interface IrisMessage {
  status: "pending_confirmations" | "complete" | string;
  message: Hex;
  attestation: Hex | "PENDING" | null;
  eventNonce?: string;
}

export async function fetchIrisMessages(
  sourceDomain: number,
  txHash: Hex,
): Promise<IrisMessage[]> {
  const url = `${IRIS_API}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new ErrorException(
      `Circle Iris API request failed (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { messages?: IrisMessage[] };
  return body.messages ?? [];
}
