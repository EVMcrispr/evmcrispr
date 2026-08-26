import type { Module } from "@evmcrispr/sdk";
import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import {
  fetchWithdrawalSettlement,
  sponsorAccountId,
  type WithdrawalSettlement,
} from "./oneBalanceApi";

/**
 * The settlement (total valid requested amount + merkle proof) a withdraw
 * or cancel call must present: from --proof/--total when given (copied
 * from app.gelato.cloud), otherwise from Gelato's 1Balance API.
 */
export async function resolveSettlement(
  module: Module,
  opts: Record<string, unknown>,
): Promise<WithdrawalSettlement> {
  const hasProof = opts.proof !== undefined;
  const hasTotal = opts.total !== undefined;
  if (hasProof !== hasTotal) {
    throw new ErrorException("--proof and --total go together");
  }
  if (hasProof) {
    if (
      !Array.isArray(opts.proof) ||
      !opts.proof.every((p) => /^0x[0-9a-fA-F]{64}$/.test(String(p)))
    ) {
      throw new ErrorException(
        "--proof must be an array of bytes32 hashes, e.g. [0x… 0x…]",
      );
    }
    return {
      merkleProof: (opts.proof as string[]).map((p) => p as Hex),
      totalValidRequestedWithdrawAmount: Num(opts.total as string).toBigInt(),
    };
  }
  const account = await module.getConnectedAccount();
  const client = await module.getClient();
  const code = await client.getCode({ address: account as Address });
  return fetchWithdrawalSettlement(
    sponsorAccountId(account, code !== undefined && code !== "0x"),
  );
}

export const settlementOpts = [
  {
    name: "proof",
    type: "array" as const,
    description:
      "Merkle proof copied from app.gelato.cloud, e.g. [0x… 0x…] (skips the 1Balance API lookup)",
  },
  {
    name: "total",
    type: "number" as const,
    description: "totalValidRequestedWithdrawAmount that goes with --proof",
  },
];
