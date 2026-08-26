import { defineCommand } from "@evmcrispr/sdk";
import { encodeFunctionData } from "viem";
import type Gelato from "..";
import { oneBalanceAbi } from "../abis";
import { ONE_BALANCE } from "../addresses";
import { parseAmount } from "../utils/duration";
import { resolveOneBalanceToken } from "../utils/oneBalance";

export default defineCommand<Gelato>({
  name: "request-withdrawal",
  description:
    "Ask the Gelato Gas Tank to release USDC back to you (step 1 of 2, on Polygon). Gelato settles requests off-chain; once settled, gelato:withdraw moves the funds and gelato:cancel-withdrawal puts them back into the tank.",
  args: [
    { name: "amount", type: "number", description: "USDC amount (6 decimals)" },
    { name: "token", type: "token-symbol", description: "USDC" },
  ],
  async run(module, { amount, token }) {
    const value = parseAmount(amount);
    const usdc = await resolveOneBalanceToken(module, String(token));
    return [
      {
        to: ONE_BALANCE.address,
        data: encodeFunctionData({
          abi: oneBalanceAbi,
          functionName: "requestWithdrawal",
          args: [usdc, value],
        }),
      },
    ];
  },
});
