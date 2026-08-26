import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { ONE_BALANCE } from "../addresses";
import { proxied } from "./upload";

/**
 * Gelato's 1Balance settlement API, as used by app.gelato.cloud (it is not
 * publicly documented; endpoints were read from the app bundle, 2026-08-26).
 * Withdrawals are merkle-gated: after `requestWithdrawal` Gelato settles
 * off-chain and publishes, per sponsor, the total valid requested amount
 * plus a proof that `withdraw`/`cancelWithdrawalRequest` must present.
 */
const API = "https://api.gelato.digital/1balance";

/** Sponsor account id: the address itself for EOAs, `chainId:address` for contracts. */
export function sponsorAccountId(
  sponsor: Address,
  isContract: boolean,
): string {
  return isContract ? `${ONE_BALANCE.chainId}:${sponsor}` : sponsor;
}

async function getJson<T>(url: string, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(proxied(url));
  } catch {
    throw new ErrorException(
      `couldn't reach Gelato's 1Balance API for ${what}`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `Gelato's 1Balance API failed for ${what} (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

export interface WithdrawalSettlement {
  totalValidRequestedWithdrawAmount: bigint;
  merkleProof: Hex[];
}

/** The settled withdrawal total and proof for a sponsor's USDC. */
export async function fetchWithdrawalSettlement(
  accountId: string,
): Promise<WithdrawalSettlement> {
  const sponsorRes = await getJson<{
    sponsor?: { mainBalance?: { totalValidRequestedWithdrawAmount?: string } };
  }>(`${API}/networks/mainnets/sponsors/${accountId}`, "the sponsor balance");
  const total =
    sponsorRes.sponsor?.mainBalance?.totalValidRequestedWithdrawAmount;
  if (total === undefined) {
    throw new ErrorException(
      "Gelato has no settled withdrawal for this sponsor yet — request one with gelato:request-withdrawal and retry once Gelato has settled it, or pass --proof and --total copied from app.gelato.cloud",
    );
  }
  const proofRes = await getJson<{ merkleProof?: Hex[] }>(
    `${API}/networks/${ONE_BALANCE.chainId}/tokens/${ONE_BALANCE.usdc}/sponsors/${accountId}/proof`,
    "the withdrawal proof",
  );
  if (!Array.isArray(proofRes.merkleProof)) {
    throw new ErrorException(
      "Gelato returned no merkle proof for this sponsor — the withdrawal request may not be settled yet",
    );
  }
  return {
    totalValidRequestedWithdrawAmount: BigInt(total),
    merkleProof: proofRes.merkleProof,
  };
}
