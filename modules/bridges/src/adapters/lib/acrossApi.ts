import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { ACROSS_API } from "../../addresses";

/** Client for Across's app API (suggested fees + deposit status). */

export interface AcrossFeeResponse {
  totalRelayFee: { pct: string; total: string };
  timestamp: string;
  fillDeadline?: string;
  exclusiveRelayer?: Address;
  exclusivityDeadline?: string | number;
  outputToken?: Address;
  outputAmount?: string;
  isAmountTooLow?: boolean;
  spokePoolAddress?: Address;
}

export async function fetchSuggestedFees(params: {
  inputToken: Address;
  outputToken: Address;
  originChainId: number;
  destinationChainId: number;
  amount: bigint;
  recipient?: Address;
}): Promise<AcrossFeeResponse> {
  const query = new URLSearchParams({
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    originChainId: String(params.originChainId),
    destinationChainId: String(params.destinationChainId),
    amount: params.amount.toString(),
    ...(params.recipient ? { recipient: params.recipient } : {}),
  });
  const res = await fetch(`${ACROSS_API}/suggested-fees?${query}`, {
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErrorException(
      `Across suggested-fees request failed (${res.status}): ${
        (body as any)?.message ?? JSON.stringify(body)
      }`,
    );
  }
  const fees = body as AcrossFeeResponse;
  if (fees.isAmountTooLow) {
    throw new ErrorException(
      "Across rejected the deposit: amount is too low to cover relay fees",
    );
  }
  return fees;
}

export async function fetchDepositStatus(
  originChainId: number,
  depositId: bigint,
): Promise<{ status?: string; fillTx?: string }> {
  const query = new URLSearchParams({
    originChainId: String(originChainId),
    depositId: depositId.toString(),
  });
  const res = await fetch(`${ACROSS_API}/deposit/status?${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return {};
  return (await res.json()) as { status?: string; fillTx?: string };
}
