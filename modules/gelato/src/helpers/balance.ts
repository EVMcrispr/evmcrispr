import { clientFor, defineHelper, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { oneBalanceAbi } from "../abis";
import { ONE_BALANCE } from "../addresses";

/** Deposited − withdrawn USDC of a Gas Tank sponsor, read on Polygon. */
export async function gasTankBalances(
  module: Gelato,
  sponsor: Address,
): Promise<{ deposited: bigint; withdrawn: bigint }> {
  const client = await clientFor(module, ONE_BALANCE.chainId);
  const [deposited, withdrawn] = await Promise.all([
    client.readContract({
      address: ONE_BALANCE.address,
      abi: oneBalanceAbi,
      functionName: "totalDepositedAmount",
      args: [sponsor, ONE_BALANCE.usdc],
    }),
    client.readContract({
      address: ONE_BALANCE.address,
      abi: oneBalanceAbi,
      functionName: "totalWithdrawnAmount",
      args: [sponsor, ONE_BALANCE.usdc],
    }),
  ]);
  return { deposited, withdrawn };
}

export default defineHelper<Gelato>({
  name: "balance",
  batchable: false,
  description:
    "USDC a sponsor has put into the Gelato Gas Tank and not withdrawn (deposits minus withdrawals, 6 decimals), read from Polygon whatever chain the script is on. Fees Gelato has already charged are not deducted — the live balance is on app.gelato.cloud.",
  returnType: "number",
  args: [
    {
      name: "sponsor",
      type: "address",
      description: "Gas Tank sponsor (defaults to the connected account)",
      optional: true,
    },
  ],
  async run(module, { sponsor }) {
    const account =
      (sponsor as Address | undefined) ?? (await module.getConnectedAccount());
    const { deposited, withdrawn } = await gasTankBalances(module, account);
    return Num.fromBigInt(deposited - withdrawn);
  },
});
