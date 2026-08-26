import { defineCommand } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Gelato from "..";
import { oneBalanceAbi } from "../abis";
import { ONE_BALANCE } from "../addresses";
import { parseAmount } from "../utils/duration";
import { resolveOneBalanceToken } from "../utils/oneBalance";
import { resolveSettlement, settlementOpts } from "../utils/settledWithdrawal";

export default defineCommand<Gelato>({
  name: "withdraw",
  description:
    "Withdraw settled USDC from the Gelato Gas Tank (step 2 of 2, on Polygon). Presents the merkle proof Gelato published after settling your gelato:request-withdrawal; fetched from the 1Balance API, or given with --proof and --total.",
  batchable: false,
  args: [
    { name: "amount", type: "number", description: "USDC amount (6 decimals)" },
    { name: "token", type: "token-symbol", description: "USDC" },
  ],
  opts: settlementOpts,
  async run(module, { amount, token }, { opts }) {
    const value = parseAmount(amount);
    const usdc = await resolveOneBalanceToken(module, String(token));
    const { totalValidRequestedWithdrawAmount, merkleProof } =
      await resolveSettlement(module, opts);
    return [
      {
        to: ONE_BALANCE.address,
        data: encodeFunctionData({
          abi: oneBalanceAbi,
          functionName: "withdraw",
          args: [usdc, value, totalValidRequestedWithdrawAmount, merkleProof],
        }),
      },
    ];
  },
});
